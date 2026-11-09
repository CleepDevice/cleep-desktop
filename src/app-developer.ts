import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { appDevices } from './app-devices';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { appVault } from './app-vault';
import type { CleepbusPeerInfos } from './cleepbus/cleepbus.types';
import {
  listDeveloperApps,
  resolveLocalPathForModule,
  resolveSelectedDeveloperApps,
  type DeveloperAppEntry,
} from './developer-apps';
import {
  CLEEP_CORE_FOLDER_NAME,
  DEVELOPER_CORE_SYNC_TOKEN,
  detectCleepCoreDir,
} from './developer-core';
import {
  deleteDeveloperSshSecret,
  getDeveloperSshSecret,
  hasDeveloperSshSecret,
  saveDeveloperSshSecret,
} from './developer-ssh';
import {
  computeDeveloperSyncDelay,
  fetchDeveloperDeviceLogTail,
  getDeveloperSyncPlatformSupport,
  getDeveloperSyncToolsStatus,
  listRemoteDeveloperModules,
  probeDeveloperSyncTools,
  rsyncDeveloperApps,
  rsyncDeveloperCore,
  type DeveloperDeviceLogTail,
  type DeveloperSyncDelayState,
  type DeveloperSyncDirection,
  type DeveloperSyncPlatformSupport,
  type DeveloperSyncToolsStatus,
} from './developer-sync';
import { handleInvoke, ipcOk, ipcErr, sendToRenderer } from './ipc/ipc-main';
import { VaultError } from './app-vault.types';

/** Module name advertised in peer `apps` when cleepapp-developer is installed. */
export const DEVELOPER_APP_NAME = 'developer';

/** Label used in sync logs for the Cleep core target. */
export const DEVELOPER_CORE_LOG_LABEL = 'cleep';

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
  /** Hostname of the selected development device (empty when none). */
  deviceHostname: string;
  /** IP of the selected development device (empty when none). */
  deviceIp: string;
  /** True when at least one known device has cleepapp-developer installed. */
  hasDeveloperDevice: boolean;
  /** Folder names selected for sync (empty by default). */
  selectedApps: string[];
  /** True when at least one valid selected app remains. */
  appsOk: boolean;
  /** Absolute path to sources/cleep when valid, else null. */
  corePath: string | null;
  /** True when a valid Cleep core checkout exists under sources. */
  coreAvailable: boolean;
  /** User opt-in to sync Cleep core (cleep.developercore). */
  coreEnabled: boolean;
  /** True when core is available and enabled. */
  coreOk: boolean;
  sshConfigured: boolean;
  syncSupported: boolean;
  syncSupport: DeveloperSyncPlatformSupport;
  /** Probe of rsync/sshpass (WSL on Windows). */
  syncTools: DeveloperSyncToolsStatus;
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

function readCoreEnabled(): boolean {
  return Boolean(appSettings.get<boolean>('cleep.developercore'));
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
  /** Folder names / core token accumulated during a watch debounce window. */
  private pendingWatchTargets = new Set<string>();
  private syncDelayState: DeveloperSyncDelayState = {
    batchStartedAt: null,
    lastChangeAt: null,
    changeCount: 0,
  };

  public configure(): void {
    this.addIpcs();
    void this.refreshSyncTools();
  }

  public setWindow(window: BrowserWindow): void {
    this.window = window;
    void this.refreshSyncTools().then(() => this.reconcileWatcher());
  }

  /**
   * Probe rsync/sshpass (via WSL on Windows). Force-disable developer mode when
   * tools are missing so watch/sync cannot run with a stale opt-in.
   */
  public async refreshSyncTools(force = false): Promise<DeveloperSyncToolsStatus> {
    const tools = await probeDeveloperSyncTools({ force });
    if (tools.probed && !tools.supported && appSettings.get<boolean>('cleep.developer')) {
      appSettings.set('cleep.developer', false);
      appLogger.info('Developer mode disabled: sync tools missing', {
        missing: tools.missing,
      });
      await this.stopWatcher();
    }
    this.emitStatus();
    return tools;
  }

  /** Vault just unlocked: retry launch upload if sync-on-load is enabled. */
  public onVaultUnlocked(): void {
    if (this.syncing) {
      // In-flight sync is waiting on ensureUnlocked and will resume by itself.
      return;
    }
    void this.reconcileWatcher().then(() => {
      const status = this.getStatus();
      if (this.isSyncReady(status) && this.isSyncOnLoadEnabled()) {
        this.scheduleSync('start');
      }
    });
  }

  public getStatus(): DeveloperStatus {
    const enabled = Boolean(appSettings.get<boolean>('cleep.developer'));
    const sourcesDir = String(appSettings.get<string>('cleep.developersources') || '').trim();
    const deviceUuid = String(appSettings.get<string>('cleep.developerdevice') || '').trim();
    const selectedApps = readSelectedApps();
    const coreEnabled = readCoreEnabled();
    const devices = appDevices.getDevices();
    const hasDeveloperDevice = devices.some((device) => deviceHasDeveloperApp(device));
    const selected = deviceUuid ? appDevices.getDevice(deviceUuid) : undefined;
    const deviceOk = deviceHasDeveloperApp(selected);
    const sourcesOk = enabled ? this.isSourcesDirectory(sourcesDir) : false;
    const resolvedApps =
      sourcesOk ? resolveSelectedDeveloperApps(sourcesDir, selectedApps) : [];
    const corePath = sourcesOk ? detectCleepCoreDir(sourcesDir) : null;
    const coreAvailable = Boolean(corePath);
    const syncSupport = getDeveloperSyncPlatformSupport();
    const syncTools = getDeveloperSyncToolsStatus();

    return {
      enabled,
      sourcesDir,
      sourcesOk,
      deviceUuid,
      deviceOk: enabled ? deviceOk : false,
      deviceHostname: selected?.hostname || '',
      deviceIp: selected?.ip || '',
      hasDeveloperDevice,
      selectedApps,
      appsOk: resolvedApps.length > 0,
      corePath,
      coreAvailable,
      coreEnabled,
      coreOk: coreAvailable && coreEnabled,
      sshConfigured: deviceUuid ? hasDeveloperSshSecret(deviceUuid) : false,
      syncSupported: syncSupport === 'supported',
      syncSupport,
      syncTools,
      syncStatus: this.syncStatus,
      syncError: this.syncError,
      lastSyncAt: this.lastSyncAt,
    };
  }

  /** Call after settings or devices change so watch/sync follow config. */
  public async reconcileWatcher(): Promise<void> {
    const status = this.getStatus();
    if (!this.isSyncReady(status)) {
      await this.stopWatcher();
      return;
    }

    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      await this.stopWatcher();
      return;
    }

    const apps = resolveSelectedDeveloperApps(status.sourcesDir, status.selectedApps);
    const watchPaths = [
      ...apps.map((app) => app.absolutePath),
      ...(status.coreOk && status.corePath ? [status.corePath] : []),
    ];
    const pathsKey = watchPaths.slice().sort().join('|');

    if (this.watcher && this.watchedPathsKey === pathsKey) {
      return;
    }

    await this.stopWatcher();
    this.watchedPathsKey = pathsKey;
    this.watcher = chokidar.watch(watchPaths, {
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
        /\/modules(\/|$)/,
      ],
    });

    const onChange = (changedPath: string) => {
      const target = this.resolveWatchTarget(changedPath);
      if (target) {
        this.pendingWatchTargets.add(target);
      }
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

    const logTargets = [
      ...apps.map((app) => app.moduleName),
      ...(status.coreOk ? [DEVELOPER_CORE_LOG_LABEL] : []),
    ];
    appLogger.info('Developer sources watcher started', {
      apps: apps.map((app) => app.moduleName),
      core: status.coreOk,
    });
    this.emitSyncLog({
      level: 'info',
      title: 'Watching developer sources',
      detail: this.watchDetail(apps.length, status.coreOk),
      deviceHostname: device.hostname || '',
      deviceIp: device.ip || '',
      apps: logTargets,
      reason: 'start',
    });
    if (this.isSyncOnLoadEnabled()) {
      this.scheduleSync('start');
    }
  }

  private isSyncOnLoadEnabled(): boolean {
    return Boolean(appSettings.get<boolean>('cleep.developersynconload'));
  }

  private isSyncReady(status: DeveloperStatus): boolean {
    return (
      status.enabled &&
      status.sourcesOk &&
      status.deviceOk &&
      status.sshConfigured &&
      status.syncSupported &&
      (status.appsOk || status.coreOk)
    );
  }

  private watchDetail(appCount: number, coreOk: boolean): string {
    const parts: string[] = [];
    if (appCount > 0) {
      parts.push(`${appCount} application${appCount === 1 ? '' : 's'}`);
    }
    if (coreOk) {
      parts.push(CLEEP_CORE_FOLDER_NAME);
    }
    return `Watching ${parts.join(' and ')} for changes`;
  }

  private addIpcs(): void {
    handleInvoke('developer-get-status', async () => {
      // Refresh tools when the UI asks for status (preferences / toolbar).
      await this.refreshSyncTools();
      return ipcOk(this.getStatus());
    });

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
        const folderNames = this.parseStringList(request, 'folderNames');
        await this.syncNow('manual', folderNames, 'push');
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.failFromError(error, 'Developer sync failed');
      }
    });

    handleInvoke('developer-list-remote-apps', async () => {
      try {
        const modules = await this.listRemoteApps();
        return ipcOk(modules);
      } catch (error) {
        return this.failFromError(error, 'Unable to list remote applications');
      }
    });

    handleInvoke('developer-fetch-device-logs', async () => {
      try {
        const payload = await this.fetchDeviceLogs();
        return ipcOk(payload);
      } catch (error) {
        return this.failFromError(error, 'Unable to fetch device logs');
      }
    });

    handleInvoke('developer-pull-now', async (_event, request) => {
      try {
        const moduleNames = this.parseStringList(request, 'moduleNames') || [];
        const includeCore = Boolean(
          request &&
            typeof request === 'object' &&
            (request as { includeCore?: unknown }).includeCore,
        );
        await this.pullFromDevice(moduleNames, includeCore);
        return ipcOk(this.getStatus());
      } catch (error) {
        return this.failFromError(error, 'Developer pull failed');
      }
    });
  }

  private parseStringList(request: unknown, key: string): string[] | undefined {
    if (!request || typeof request !== 'object') {
      return undefined;
    }
    const raw = (request as Record<string, unknown>)[key];
    if (!Array.isArray(raw)) {
      return undefined;
    }
    return raw.map((name) => String(name || '').trim()).filter(Boolean);
  }

  private async listRemoteApps(): Promise<string[]> {
    const status = this.getStatus();
    if (!status.enabled || !status.deviceOk || !status.sshConfigured || !status.syncSupported) {
      throw new Error('Developer sync is not ready');
    }
    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      throw new Error('Development device is offline');
    }
    const ssh = await getDeveloperSshSecret(status.deviceUuid);
    if (!ssh) {
      throw new Error('SSH credentials are not configured');
    }
    return listRemoteDeveloperModules({ host: device.ip, ssh });
  }

  private async fetchDeviceLogs(): Promise<DeveloperDeviceLogTail> {
    const status = this.getStatus();
    if (!status.enabled || !status.deviceOk || !status.sshConfigured || !status.syncSupported) {
      throw new Error('Developer sync is not ready');
    }
    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      throw new Error('Development device is offline');
    }
    const ssh = await getDeveloperSshSecret(status.deviceUuid);
    if (!ssh) {
      throw new Error('SSH credentials are not configured');
    }
    return fetchDeveloperDeviceLogTail({ host: device.ip, ssh });
  }

  /** Pull remote modules (and optionally core) into the local sources directory. */
  private async pullFromDevice(moduleNames: string[], includeCore: boolean): Promise<void> {
    if (this.syncing) {
      return;
    }

    const status = this.getStatus();
    if (
      !status.enabled ||
      !status.sourcesOk ||
      !status.deviceOk ||
      !status.sshConfigured ||
      !status.syncSupported
    ) {
      return;
    }

    const pullCore = includeCore && status.coreOk && Boolean(status.corePath);
    const modules = moduleNames.map((name) => String(name || '').trim()).filter(Boolean);
    if (!modules.length && !pullCore) {
      throw new Error('Nothing selected to download');
    }

    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      throw new Error('Development device is offline');
    }

    const apps: DeveloperAppEntry[] = modules.map((moduleName) => {
      const absolutePath = resolveLocalPathForModule(status.sourcesDir, moduleName);
      fs.mkdirSync(absolutePath, { recursive: true });
      return {
        folderName: moduleName,
        absolutePath,
        valid: true,
        moduleName,
        label: moduleName,
        icon: 'puzzle',
      };
    });

    const logLabels = [
      ...apps.map((app) => app.moduleName as string),
      ...(pullCore ? [DEVELOPER_CORE_LOG_LABEL] : []),
    ];
    const hostLabel = device.hostname || device.ip;

    this.syncing = true;
    this.setSyncState('syncing', '');
    this.emitSyncLog({
      level: 'info',
      title: 'Download started',
      detail: `Downloading ${logLabels.join(', ')} from ${hostLabel}`,
      deviceHostname: device.hostname || '',
      deviceIp: device.ip || '',
      apps: logLabels,
      reason: 'manual',
    });
    try {
      const ssh = await getDeveloperSshSecret(status.deviceUuid);
      if (!ssh) {
        throw new Error('SSH credentials are not configured');
      }
      const jobs: Promise<void>[] = [];
      if (apps.length) {
        jobs.push(rsyncDeveloperApps({ host: device.ip, ssh, apps, direction: 'pull' }));
      }
      if (pullCore && status.corePath) {
        jobs.push(
          rsyncDeveloperCore({
            host: device.ip,
            ssh,
            localCorePath: status.corePath,
            direction: 'pull',
          }),
        );
      }
      await Promise.all(jobs);
      this.lastSyncAt = Date.now();
      this.setSyncState('ok', '');
      this.emitSyncLog({
        level: 'success',
        title: 'Download completed',
        detail: `Downloaded ${logLabels.join(', ')} from ${hostLabel}`,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: logLabels,
        reason: 'manual',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Developer pull failed';
      appLogger.warn('Developer pull failed', { message });
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Download failed',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: logLabels,
        reason: 'manual',
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

  private failFromError(error: unknown, fallback: string) {
    if (error instanceof VaultError) {
      return ipcErr(error.code, error.message);
    }
    const message = error instanceof Error ? error.message : fallback;
    return ipcErr('DEVELOPER_SYNC_FAILED', message);
  }

  /**
   * Map a changed filesystem path to a sync target (app folderName or core token).
   */
  private resolveWatchTarget(changedPath: string): string | null {
    const status = this.getStatus();
    const normalized = path.resolve(changedPath);

    if (status.coreOk && status.corePath) {
      const coreRoot = path.resolve(status.corePath);
      if (normalized === coreRoot || normalized.startsWith(coreRoot + path.sep)) {
        const rel = normalized.slice(coreRoot.length);
        // modules/ under core is excluded from rsync; ignore those events.
        if (rel === `${path.sep}modules` || rel.startsWith(`${path.sep}modules${path.sep}`)) {
          return null;
        }
        return DEVELOPER_CORE_SYNC_TOKEN;
      }
    }

    if (!status.sourcesOk || !status.selectedApps.length) {
      return null;
    }
    const apps = resolveSelectedDeveloperApps(status.sourcesDir, status.selectedApps);
    for (const app of apps) {
      const root = path.resolve(app.absolutePath);
      if (normalized === root || normalized.startsWith(root + path.sep)) {
        return app.folderName;
      }
    }
    return null;
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
      if (reason === 'start') {
        void this.syncNow('start').catch(() => {
          /* status already updated */
        });
        return;
      }
      // watch + queued: only sync paths that actually changed.
      const folderNames = Array.from(this.pendingWatchTargets);
      this.pendingWatchTargets.clear();
      if (!folderNames.length) {
        return;
      }
      void this.syncNow('watch', folderNames).catch(() => {
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

  private async syncNow(
    reason: DeveloperSyncReason,
    folderNames?: string[],
    direction: DeveloperSyncDirection = 'push',
  ): Promise<void> {
    if (this.syncing) {
      // Only queue automatic pushes; manual pull/push must not pile behind watch sync.
      if (reason !== 'manual' && direction === 'push') {
        this.syncQueued = true;
      }
      return;
    }

    const status = this.getStatus();
    if (!this.isSyncReady(status)) {
      return;
    }

    const device = appDevices.getDevice(status.deviceUuid);
    if (!device?.online || !device.ip) {
      const message = 'Development device is offline';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: direction === 'pull' ? 'Download failed' : 'Upload failed',
        detail: message,
        deviceHostname: device?.hostname || '',
        deviceIp: device?.ip || '',
        apps: [],
        reason,
      });
      return;
    }

    const includeCore =
      status.coreOk &&
      (!folderNames?.length ||
        folderNames.includes(DEVELOPER_CORE_SYNC_TOKEN) ||
        folderNames.includes(CLEEP_CORE_FOLDER_NAME));

    const selectedFolderNames = folderNames?.length
      ? status.selectedApps.filter((name) => folderNames.includes(name))
      : status.selectedApps;
    const apps = resolveSelectedDeveloperApps(status.sourcesDir, selectedFolderNames);

    if (!apps.length && !includeCore) {
      const message = folderNames?.length
        ? 'No applications selected for sync'
        : 'Nothing selected for sync';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: direction === 'pull' ? 'Download failed' : 'Upload failed',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: [],
        reason,
      });
      return;
    }

    const logLabels = [
      ...apps.map((app) => app.moduleName),
      ...(includeCore ? [DEVELOPER_CORE_LOG_LABEL] : []),
    ];

    // Watch must not open a vault unlock dialog: a dismissed prompt can leave
    // ensureUnlocked pending forever, which stuck syncing=true and ignored file changes.
    // Launch upload (sync-on-load) may prompt, but only before syncing=true is set.
    if (reason === 'start' && this.isSyncOnLoadEnabled() && !appVault.isUnlocked()) {
      try {
        await appVault.ensureUnlocked();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Vault unlock cancelled';
        this.setSyncState('failed', message);
        this.emitSyncLog({
          level: 'error',
          title: 'Upload waiting for vault',
          detail: message,
          deviceHostname: device.hostname || '',
          deviceIp: device.ip || '',
          apps: logLabels,
          reason,
        });
        return;
      }
    } else if (reason !== 'manual' && !appVault.isUnlocked()) {
      const message = 'Vault is locked — unlock it to synchronize sources';
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: 'Synchronization waiting for vault',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: logLabels,
        reason,
      });
      return;
    }

    const hostLabel = device.hostname || device.ip;
    const actionVerb = direction === 'pull' ? 'Downloading' : 'Uploading';
    const prep = direction === 'pull' ? 'from' : 'to';

    this.syncing = true;
    this.setSyncState('syncing', '');
    this.emitSyncLog({
      level: 'info',
      title: this.syncStartTitle(reason, direction),
      detail: `${actionVerb} ${logLabels.join(', ')} ${prep} ${hostLabel}`,
      deviceHostname: device.hostname || '',
      deviceIp: device.ip || '',
      apps: logLabels,
      reason,
    });
    try {
      const ssh = await getDeveloperSshSecret(status.deviceUuid);
      if (!ssh) {
        throw new Error('SSH credentials are not configured');
      }

      const jobs: Promise<void>[] = [];
      if (apps.length) {
        jobs.push(rsyncDeveloperApps({ host: device.ip, ssh, apps, direction }));
      }
      if (includeCore && status.corePath) {
        jobs.push(
          rsyncDeveloperCore({
            host: device.ip,
            ssh,
            localCorePath: status.corePath,
            direction,
          }),
        );
      }
      await Promise.all(jobs);

      this.lastSyncAt = Date.now();
      this.setSyncState('ok', '');
      this.emitSyncLog({
        level: 'success',
        title: direction === 'pull' ? 'Download completed' : 'Upload completed',
        detail: `${direction === 'pull' ? 'Downloaded' : 'Uploaded'} ${logLabels.join(', ')} ${prep} ${hostLabel}`,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: logLabels,
        reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Developer sync failed';
      appLogger.warn('Developer sync failed', { message, direction });
      this.setSyncState('failed', message);
      this.emitSyncLog({
        level: 'error',
        title: direction === 'pull' ? 'Download failed' : 'Upload failed',
        detail: message,
        deviceHostname: device.hostname || '',
        deviceIp: device.ip || '',
        apps: logLabels,
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

  private syncStartTitle(reason: DeveloperSyncReason, direction: DeveloperSyncDirection): string {
    if (direction === 'pull') {
      return 'Download started';
    }
    if (reason === 'manual') {
      return 'Upload started';
    }
    if (reason === 'start') {
      return 'Initial upload started';
    }
    return 'Upload started';
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
    this.pendingWatchTargets.clear();
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
