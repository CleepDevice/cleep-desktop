import { BrowserWindow } from 'electron';
import fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { appDevices } from './app-devices';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { appVault } from './app-vault';
import type { CleepbusPeerInfos } from './cleepbus/cleepbus.types';
import {
  listDeveloperApps,
  resolveSelectedDeveloperApps,
  type DeveloperAppEntry,
} from './developer-apps';
import {
  deleteDeveloperSshSecret,
  getDeveloperSshSecret,
  hasDeveloperSshSecret,
  saveDeveloperSshSecret,
} from './developer-ssh';
import {
  computeDeveloperSyncDelay,
  getDeveloperSyncPlatformSupport,
  rsyncDeveloperApps,
  type DeveloperSyncDelayState,
  type DeveloperSyncPlatformSupport,
} from './developer-sync';
import { handleInvoke, ipcOk, ipcErr, sendToRenderer } from './ipc/ipc-main';
import { VaultError } from './app-vault.types';

/** Module name advertised in peer `apps` when cleepapp-developer is installed. */
export const DEVELOPER_APP_NAME = 'developer';

export type DeveloperSyncState = 'idle' | 'syncing' | 'ok' | 'failed';

export type DeveloperSyncLogLevel = 'info' | 'success' | 'error';

export type DeveloperSyncReason = 'start' | 'watch' | 'manual' | 'queued';

/** Session-only sync activity line pushed to the renderer (not persisted). */
export type DeveloperSyncLogEntry = {
  id: number;
  timestamp: number;
  level: DeveloperSyncLogLevel;
  title: string;
  detail: string;
  deviceHostname: string;
  deviceIp: string;
  apps: string[];
  reason: DeveloperSyncReason | '';
};

export type DeveloperStatus = {
  enabled: boolean;
  sourcesDir: string;
  /** True when a sources directory is configured and exists on disk. */
  sourcesOk: boolean;
  /** Selected development device uuid (may be empty). */
  deviceUuid: string;
  /** True when the selected device exists and has cleepapp-developer installed. */
  deviceOk: boolean;
  /** True when at least one known device has cleepapp-developer installed. */
  hasDeveloperDevice: boolean;
  /** Folder names selected for sync (empty by default). */
  selectedApps: string[];
  /** True when at least one valid selected app remains. */
  appsOk: boolean;
  sshConfigured: boolean;
  syncSupported: boolean;
  syncSupport: DeveloperSyncPlatformSupport;
  syncStatus: DeveloperSyncState;
  syncError: string;
  lastSyncAt: number | null;
};

export function deviceHasDeveloperApp(device: CleepbusPeerInfos | undefined): boolean {
  if (!device || device.cleepdesktop) {
    return false;
  }
  const apps = device.extra?.apps;
  return Array.isArray(apps) && apps.includes(DEVELOPER_APP_NAME);
}

function readSelectedApps(): string[] {
  const raw = appSettings.get<unknown>('cleep.developerapps');
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => String(item || '').trim()).filter(Boolean);
}

class AppDeveloper {
  private window: BrowserWindow | null = null;
  private watcher: FSWatcher | null = null;
  private quietTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private syncQueued = false;
  private syncStatus: DeveloperSyncState = 'idle';
  private syncError = '';
  private lastSyncAt: number | null = null;
  private watchedPathsKey = '';
  private syncLogSeq = 0;
  private syncDelayState: DeveloperSyncDelayState = {
    batchStartedAt: null,
    lastChangeAt: null,
    changeCount: 0,
  };

  public configure(): void {
    this.addIpcs();
  }

  public setWindow(window: BrowserWindow): void {
    this.window = window;
    void this.reconcileWatcher();
  }

  /** Vault just unlocked: retry sync if developer mode is armed (SSH secret readable). */
  public onVaultUnlocked(): void {
    if (this.syncing) {
      // In-flight sync is waiting on ensureUnlocked and will resume by itself.
      return;
    }
    void this.reconcileWatcher().then(() => {
      const status = this.getStatus();
      if (
        status.enabled &&
        status.sourcesOk &&
        status.deviceOk &&
        status.appsOk &&
        status.sshConfigured &&
        status.syncSupported
      ) {
        this.scheduleSync('start');
      }
    });
  }

  public getStatus(): DeveloperStatus {
    const enabled = Boolean(appSettings.get<boolean>('cleep.developer'));
    const sourcesDir = String(appSettings.get<string>('cleep.developersources') || '').trim();
    const deviceUuid = String(appSettings.get<string>('cleep.developerdevice') || '').trim();
    const selectedApps = readSelectedApps();
    const devices = appDevices.getDevices();
    const hasDeveloperDevice = devices.some((device) => deviceHasDeveloperApp(device));
    const selected = deviceUuid ? appDevices.getDevice(deviceUuid) : undefined;
    const deviceOk = deviceHasDeveloperApp(selected);
    const sourcesOk = enabled ? this.isSourcesDirectory(sourcesDir) : false;
    const resolvedApps =
      sourcesOk ? resolveSelectedDeveloperApps(sourcesDir, selectedApps) : [];
    const syncSupport = getDeveloperSyncPlatformSupport();

    return {
      enabled,
      sourcesDir,
      sourcesOk,
      deviceUuid,
      deviceOk: enabled ? deviceOk : false,
      hasDeveloperDevice,
      selectedApps,
      appsOk: resolvedApps.length > 0,
      sshConfigured: deviceUuid ? hasDeveloperSshSecret(deviceUuid) : false,
      syncSupported: syncSupport === 'supported',
      syncSupport,
      syncStatus: this.syncStatus,
      syncError: this.syncError,
      lastSyncAt: this.lastSyncAt,
    };
  }

  /** Call after settings or devices change so watch/sync follow config. */
  public async reconcileWatcher(): Promise<void> {
    const status = this.getStatus();
    const ready =
      status.enabled &&
      status.sourcesOk &&
      status.deviceOk &&
      status.appsOk &&
      status.sshConfigured &&
      status.syncSupported;

    if (!ready) {
      await this.stopWatcher();
      return;
    }

    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      await this.stopWatcher();
      return;
    }

    const apps = resolveSelectedDeveloperApps(status.sourcesDir, status.selectedApps);
    const pathsKey = apps
      .map((app) => app.absolutePath)
      .sort()
      .join('|');

    if (this.watcher && this.watchedPathsKey === pathsKey) {
      return;
    }

    await this.stopWatcher();
    this.watchedPathsKey = pathsKey;
    this.watcher = chokidar.watch(
      apps.map((app) => app.absolutePath),
      {
        ignoreInitial: true,
        // Cursor/editor saves often rewrite via temp+rename; wait for the file to settle.
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
        ignored: [
          /(^|[/\\])\../,
          /node_modules/,
          /\.git/,
          /__pycache__/,
          /\.venv/,
          /venv/,
        ],
      },
    );

    const onChange = () => {
      this.scheduleSync('watch');
    };
    this.watcher.on('add', onChange);
    this.watcher.on('change', onChange);
    this.watcher.on('unlink', onChange);
    this.watcher.on('addDir', onChange);
    this.watcher.on('unlinkDir', onChange);
    this.watcher.on('error', (error) => {
      appLogger.warn('Developer sources watcher error', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    appLogger.info('Developer sources watcher started', {
      apps: apps.map((app) => app.moduleName),
    });
    this.emitSyncLog({
      level: 'info',
      title: 'Watching application sources',
      detail: `Watching ${apps.length} application${apps.length === 1 ? '' : 's'} for changes`,
      deviceHostname: device.hostname || '',
      deviceIp: device.ip || '',
      apps: apps.map((app) => app.moduleName),
      reason: 'start',
    });
    this.scheduleSync('start');
  }

  private addIpcs(): void {
    handleInvoke('developer-get-status', () => ipcOk(this.getStatus()));

    handleInvoke('developer-list-apps', () => {
      const sourcesDir = String(appSettings.get<string>('cleep.developersources') || '').trim();
      return ipcOk(listDeveloperApps(sourcesDir));
    });

    handleInvoke('developer-save-ssh', async (_event, request) => {
      try {
        await saveDeveloperSshSecret(request.deviceUuid, request.password, request.username);
        await this.reconcileWatcher();
        this.emitStatus();
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.failFromError(error, 'Unable to save SSH credentials');
      }
    });

    handleInvoke('developer-clear-ssh', async (_event, request) => {
      try {
        await deleteDeveloperSshSecret(request.deviceUuid);
        await this.stopWatcher();
        this.emitStatus();
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.failFromError(error, 'Unable to clear SSH credentials');
      }
    });

    handleInvoke('developer-sync-now', async (_event, request) => {
      try {
        const rawFolderNames =
          request && typeof request === 'object' && Array.isArray(request.folderNames)
            ? request.folderNames
            : undefined;
        const folderNames = rawFolderNames
          ? rawFolderNames.map((name: string) => String(name || '').trim()).filter(Boolean)
          : undefined;
        await this.syncNow('manual', folderNames);
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.failFromError(error, 'Developer sync failed');
      }
    });
  }

  private failFromError(error: unknown, fallback: string) {
    if (error instanceof VaultError) {
      return ipcErr(error.code, error.message);
    }
    const message = error instanceof Error ? error.message : fallback;
    return ipcErr('DEVELOPER_SYNC_FAILED', message);
  }

  private scheduleSync(reason: 'start' | 'watch' | 'queued'): void {
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
    }

    // Initial / queued syncs can run promptly; watch events use adaptive debounce.
    let delayMs = 0;
    if (reason === 'watch') {
      const next = computeDeveloperSyncDelay(this.syncDelayState);
      this.syncDelayState = {
        batchStartedAt: next.batchStartedAt,
        lastChangeAt: next.lastChangeAt,
        changeCount: next.changeCount,
      };
      delayMs = next.delayMs;
      if (next.inBurst) {
        appLogger.debug('Developer sync burst debounce', {
          changeCount: next.changeCount,
          delayMs,
        });
      }
    } else {
      this.resetSyncDelayState();
    }

    this.quietTimer = setTimeout(() => {
      this.quietTimer = null;
      this.resetSyncDelayState();
      const syncReason: DeveloperSyncReason = reason === 'start' ? 'start' : 'watch';
      void this.syncNow(syncReason).catch(() => {
        /* status already updated */
      });
    }, delayMs);
  }

  private resetSyncDelayState(): void {
    this.syncDelayState = {
      batchStartedAt: null,
      lastChangeAt: null,
      changeCount: 0,
    };
  }

  private async syncNow(reason: DeveloperSyncReason, folderNames?: string[]): Promise<void> {
    if (this.syncing) {
      this.syncQueued = true;
      return;
    }

    const status = this.getStatus();
    if (
      !status.enabled ||
      !status.sourcesOk ||
      !status.deviceOk ||
      !status.appsOk ||
      !status.sshConfigured ||
      !status.syncSupported
    ) {
      return;
    }

    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      const message = 'Development device is offline';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Synchronization failed',
        detail: message,
        deviceHostname: device?.hostname || '',
        deviceIp: device?.ip || '',
        apps: [],
        reason,
      });
      return;
    }

    // Optional subset for manual "sync this app" — still limited to selected apps.
    const selectedFolderNames =
      folderNames && folderNames.length
        ? status.selectedApps.filter((name) => folderNames.includes(name))
        : status.selectedApps;
    const apps = resolveSelectedDeveloperApps(status.sourcesDir, selectedFolderNames);
    if (!apps.length) {
      const message = 'No applications selected for sync';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Synchronization failed',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: [],
        reason,
      });
      return;
    }

    const appNames = apps.map((app) => app.moduleName);

    // Watch/start must not open a vault unlock dialog: a dismissed prompt can leave
    // ensureUnlocked pending forever, which stuck syncing=true and ignored file changes.
    if (reason !== 'manual' && !appVault.isUnlocked()) {
      const message = 'Vault is locked — unlock it to synchronize sources';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Synchronization waiting for vault',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: appNames,
        reason,
      });
      return;
    }

    this.syncing = true;
    this.setSyncState('syncing', '');
    this.emitSyncLog({
      level: 'info',
      title: this.syncStartTitle(reason),
      detail: `Syncing ${appNames.join(', ')} to ${device.hostname || device.ip}`,
      deviceHostname: device.hostname || '',
      deviceIp: device.ip || '',
      apps: appNames,
      reason,
    });
    try {
      const ssh = await getDeveloperSshSecret(status.deviceUuid);
      if (!ssh) {
        throw new Error('SSH credentials are not configured');
      }
      await rsyncDeveloperApps({ host: device.ip, ssh, apps });
      this.lastSyncAt = Date.now();
      this.setSyncState('ok', '');
      this.emitSyncLog({
        level: 'success',
        title: 'Synchronization completed',
        detail: `Synced ${appNames.join(', ')} to ${device.hostname || device.ip}`,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: appNames,
        reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Developer sync failed';
      appLogger.warn('Developer sync failed', { message });
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Synchronization failed',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: appNames,
        reason,
      });
      throw error;
    } finally {
      this.syncing = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        this.scheduleSync('queued');
      }
    }
  }

  private syncStartTitle(reason: DeveloperSyncReason): string {
    if (reason === 'manual') {
      return 'Manual synchronization started';
    }
    if (reason === 'start') {
      return 'Initial synchronization started';
    }
    return 'Synchronization started';
  }

  private setSyncState(status: DeveloperSyncState, error: string): void {
    this.syncStatus = status;
    this.syncError = error;
    this.emitStatus();
  }

  private emitStatus(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    try {
      sendToRenderer(this.window, 'developer-status-changed', this.getStatus());
    } catch (error) {
      appLogger.debug('Unable to emit developer-status-changed', { error });
    }
  }

  private emitSyncLog(partial: Omit<DeveloperSyncLogEntry, 'id' | 'timestamp'>): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.syncLogSeq += 1;
    const entry: DeveloperSyncLogEntry = {
      id: this.syncLogSeq,
      // Seconds — matches monitoring messages and hrTimestamp / hrDatetime filters.
      timestamp: Math.round(Date.now() / 1000),
      ...partial,
    };
    try {
      sendToRenderer(this.window, 'developer-sync-log', entry);
    } catch (error) {
      appLogger.debug('Unable to emit developer-sync-log', { error });
    }
  }

  private async stopWatcher(): Promise<void> {
    if (this.quietTimer) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    this.resetSyncDelayState();
    this.watchedPathsKey = '';
    if (!this.watcher) {
      return;
    }
    const current = this.watcher;
    this.watcher = null;
    try {
      await current.close();
    } catch (error) {
      appLogger.debug('Unable to close developer watcher', { error });
    }
  }

  private isSourcesDirectory(sourcesDir: string): boolean {
    if (!sourcesDir) {
      return false;
    }
    try {
      return fs.statSync(sourcesDir).isDirectory();
    } catch {
      return false;
    }
  }
}

export const appDeveloper = new AppDeveloper();

// Re-export for callers that only need the scan type.
export type { DeveloperAppEntry };
