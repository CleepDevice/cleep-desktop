import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Open } from 'unzipper';
import { appLogger } from './app-logger';
import { appAuth } from './app-auth';
import { appContext } from './app-context';
import { appDevices } from './app-devices';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';
import { asBasename, resolvePathInside } from './utils/safe-path';
import { downloadFile, generateSha256 } from './utils/download';
import {
  buildMismatchNotes,
  flashUf2ToBootsel,
  listBootselDevices,
  tryAutomountBootselVolumes,
  type PicoBootselDevice,
} from './pico/bootsel';
import {
  listMicroPythonPorts,
  probeMicroPython,
  pushFilesToMicroPython,
  waitForMicroPythonPort,
  type MicroPythonPort,
} from './pico/micropython';
import { checkFirmwarePermissions, type FirmwarePermissionStatus } from './pico/permissions';
import { ensureFlashNukeUf2 } from './pico/nuke';
import {
  ensureMicroPythonRuntime,
  selectRuntimeVariant,
} from './pico/runtime';
import { listPicoFlashTargets, type PicoFlashTarget } from './pico/targets';
import { extractZipArchive } from './utils/unzip';
import { addPlatformBreadcrumb, reportPlatformIssue } from './utils/sentry-report';

/** Descriptor as emitted by device ``update.module.firmware``. */
export interface FirmwareDescriptor {
  id: string;
  hash: string;
  name: string;
  app: string;
  firmware_version: string;
  kind: string;
  date: string;
  targets?: string[];
  requires_bootsel?: boolean;
  description?: string | null;
  urls: {
    zip: string;
    manifest: string;
  };
}

export interface CachedFirmware extends FirmwareDescriptor {
  deviceUuid: string;
  module: string;
  cachedAt: number;
  zipPath: string;
  manifestPath: string;
}

export interface FirmwareDownloadRequest {
  deviceUuid: string;
  module: string;
  baseUrl: string;
  firmwares: FirmwareDescriptor[];
}

export interface FirmwareDownloadProgress {
  status: 'running' | 'success' | 'error';
  percent: number;
  current?: string;
  error?: string;
  cached?: CachedFirmware[];
}

export interface FirmwareFlashRequest {
  hash: string;
  /** BOOTSEL mount path for UF2 kinds */
  mountPath?: string;
  /** Serial CDC path for micropython-app */
  serialPath?: string;
  /** Unified target id from firmware-scan-targets (bootsel:… / serial:…) */
  targetId?: string;
  /** Automatically prepare MicroPython runtime when flashing an app. */
  autoPrepare?: boolean;
}

export interface FirmwareEraseRequest {
  /** BOOTSEL mount path when already in storage mode */
  mountPath?: string;
  /** Unified target id from firmware-scan-targets */
  targetId?: string;
}

export type { PicoFlashTarget, FirmwarePermissionStatus };

export interface FirmwareFlashProgress {
  status: 'running' | 'success' | 'error';
  percent: number;
  current?: string;
  error?: string;
}

export interface FirmwareFlashPreview {
  firmware: CachedFirmware;
  device?: PicoBootselDevice;
  serialPort?: MicroPythonPort;
  /** Soft supplier advisories (Wi-Fi / headers / unknown board). */
  warnings: string[];
  /** High-risk MCU family mismatches (e.g. Pico 2 firmware on Pico 1). */
  errors: string[];
  flashable: boolean;
  reason?: string;
  mode: 'uf2' | 'micropython-app';
}

function splitMismatchNotes(targets: string[] | undefined, device?: PicoBootselDevice): {
  warnings: string[];
  errors: string[];
} {
  if (!device) {
    return { warnings: [], errors: [] };
  }
  const notes = buildMismatchNotes(targets, device);
  return {
    warnings: notes.filter((n) => n.level === 'warning').map((n) => n.message),
    errors: notes.filter((n) => n.level === 'error').map((n) => n.message),
  };
}

const UF2_KINDS = new Set(['native', 'micropython-runtime']);
const PAYLOAD_UF2 = 'payload.uf2';
const FILES_DIR = 'files';

function normalizeHash(hash: string): string {
  const value = String(hash || '').trim().toLowerCase();
  if (value.startsWith('sha256:')) {
    return value;
  }
  if (/^[0-9a-f]{64}$/.test(value)) {
    return `sha256:${value}`;
  }
  return value;
}

function hashToDirName(hash: string): string {
  return normalizeHash(hash).replace(/^sha256:/, '');
}

export class AppFirmware {
  private readonly rootDir = path.join(app.getPath('userData'), 'firmwares');
  private window: BrowserWindow | null = null;
  private downloading = false;
  private flashing = false;

  constructor() {
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
    this.addIpcs();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
  }

  private addIpcs(): void {
    handleInvoke('firmware-list', () => {
      try {
        return ipcOk(this.list());
      } catch (error) {
        appLogger.error('Unable to list firmwares', { error });
        return ipcErr('FIRMWARE_LIST_FAILED', 'Unable to list firmwares');
      }
    });

    handleInvoke('firmware-delete', (_event, hash) => {
      try {
        return ipcOk(this.delete(String(hash)));
      } catch (error) {
        appLogger.error('Unable to delete firmware', { hash, error });
        return ipcErr('FIRMWARE_DELETE_FAILED', 'Unable to delete firmware');
      }
    });

    handleInvoke('firmware-unknown', (_event, hashes) => {
      try {
        const list = Array.isArray(hashes) ? hashes.map((h) => String(h)) : [];
        return ipcOk(this.unknownHashes(list));
      } catch (error) {
        appLogger.error('Unable to check firmware hashes', { error });
        return ipcErr('FIRMWARE_UNKNOWN_FAILED', 'Unable to check firmware hashes');
      }
    });

    handleInvoke('firmware-set-blocking', (_event, blocked) => {
      try {
        this.setBlocking(Boolean(blocked));
        return ipcOk(true);
      } catch (error) {
        appLogger.error('Unable to set firmware quit block', { error });
        return ipcErr('FIRMWARE_BLOCK_FAILED', 'Unable to set firmware quit block');
      }
    });

    handleInvoke('firmware-download', async (_event, request) => {
      try {
        const cached = await this.downloadBatch(request as FirmwareDownloadRequest);
        return ipcOk(cached);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Firmware download failed';
        appLogger.error('Firmware download failed', { error });
        reportPlatformIssue('firmware-download', error, {
          deviceUuid: (request as FirmwareDownloadRequest)?.deviceUuid,
          module: (request as FirmwareDownloadRequest)?.module,
        });
        this.emitProgress({ status: 'error', percent: 100, error: message });
        return ipcErr('FIRMWARE_DOWNLOAD_FAILED', message);
      }
    });

    handleInvoke('firmware-scan-pico', async () => {
      try {
        return ipcOk(await listBootselDevices());
      } catch (error) {
        appLogger.error('Unable to scan Pico BOOTSEL devices', { error });
        return ipcErr('FIRMWARE_SCAN_FAILED', 'Unable to scan Pico devices');
      }
    });

    handleInvoke('firmware-scan-serial', async () => {
      try {
        return ipcOk(await listMicroPythonPorts());
      } catch (error) {
        appLogger.error('Unable to scan Pico serial ports', { error });
        return ipcErr('FIRMWARE_SERIAL_SCAN_FAILED', 'Unable to scan Pico serial ports');
      }
    });

    handleInvoke('firmware-scan-targets', async () => {
      try {
        return ipcOk(await listPicoFlashTargets());
      } catch (error) {
        appLogger.error('Unable to scan Pico targets', { error });
        return ipcErr('FIRMWARE_TARGETS_FAILED', 'Unable to scan Pico devices');
      }
    });

    handleInvoke('firmware-check-permissions', async () => {
      try {
        return ipcOk(await checkFirmwarePermissions());
      } catch (error) {
        appLogger.error('Unable to check firmware permissions', { error });
        return ipcErr('FIRMWARE_PERMISSIONS_FAILED', 'Unable to check flash permissions');
      }
    });

    handleInvoke('firmware-flash-preview', async (_event, request) => {
      try {
        return ipcOk(await this.buildFlashPreview(request as FirmwareFlashRequest));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to prepare flash';
        return ipcErr('FIRMWARE_PREVIEW_FAILED', message);
      }
    });

    handleInvoke('firmware-flash', async (_event, request) => {
      try {
        await this.flashSmart(request as FirmwareFlashRequest);
        return ipcOk(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Firmware flash failed';
        appLogger.error('Firmware flash failed', { error });
        reportPlatformIssue('pico-flash', error, {
          hash: (request as FirmwareFlashRequest)?.hash,
          targetId: (request as FirmwareFlashRequest)?.targetId,
        });
        this.emitFlashProgress({ status: 'error', percent: 100, error: message, current: message });
        return ipcErr('FIRMWARE_FLASH_FAILED', message);
      }
    });

    handleInvoke('firmware-erase', async (_event, request) => {
      try {
        await this.erasePico((request || {}) as FirmwareEraseRequest);
        return ipcOk(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pico erase failed';
        appLogger.error('Pico erase failed', { error });
        reportPlatformIssue('pico-erase', error, {
          targetId: (request as FirmwareEraseRequest)?.targetId,
          mountPath: (request as FirmwareEraseRequest)?.mountPath,
        });
        this.emitFlashProgress({ status: 'error', percent: 100, error: message, current: message });
        return ipcErr('FIRMWARE_ERASE_FAILED', message);
      }
    });
  }

  public setBlocking(blocked: boolean): void {
    if (blocked) {
      appContext.setClosingBlocked(true, {
        title: 'Firmware operation in progress',
        message: 'Finish the firmware dialog before quitting.',
        detail:
          'A Pico firmware download or flash is still open. Use Flash or Cancel in the dialog, then quit CleepDesktop.',
      });
      return;
    }
    if (!this.downloading && !this.flashing) {
      appContext.setClosingBlocked(false);
    }
  }

  public has(hash: string): boolean {
    const dir = path.join(this.rootDir, hashToDirName(hash));
    return (
      fs.existsSync(path.join(dir, 'meta.json')) &&
      fs.existsSync(path.join(dir, 'firmware.zip')) &&
      fs.existsSync(path.join(dir, 'firmware.manifest'))
    );
  }

  public unknownHashes(hashes: string[]): string[] {
    return hashes.filter((hash) => !this.has(hash));
  }

  public list(): CachedFirmware[] {
    if (!fs.existsSync(this.rootDir)) {
      return [];
    }
    const entries: CachedFirmware[] = [];
    for (const name of fs.readdirSync(this.rootDir)) {
      try {
        const metaPath = resolvePathInside(this.rootDir, asBasename(name), 'meta.json');
        if (!fs.existsSync(metaPath)) {
          continue;
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CachedFirmware;
        if (meta?.hash && this.has(meta.hash)) {
          entries.push({
            ...meta,
            zipPath: resolvePathInside(this.rootDir, asBasename(name), 'firmware.zip'),
            manifestPath: resolvePathInside(this.rootDir, asBasename(name), 'firmware.manifest'),
          });
        }
      } catch {
        appLogger.warn('Invalid firmware cache entry', { name });
      }
    }
    return entries.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
  }

  public delete(hash: string): boolean {
    const dir = resolvePathInside(this.rootDir, asBasename(hashToDirName(hash)));
    if (!fs.existsSync(dir)) {
      return false;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return !fs.existsSync(dir);
  }

  public async downloadBatch(request: FirmwareDownloadRequest): Promise<CachedFirmware[]> {
    if (this.downloading) {
      throw new Error('A firmware download is already running');
    }
    if (!request?.deviceUuid || !request?.baseUrl || !Array.isArray(request.firmwares)) {
      throw new Error('Invalid firmware download request');
    }

    this.downloading = true;
    this.setBlocking(true);
    const cached: CachedFirmware[] = [];

    try {
      const todo = request.firmwares.filter((fw) => !this.has(fw.hash));
      const totalSteps = Math.max(request.firmwares.length * 2, 1);
      let doneSteps = (request.firmwares.length - todo.length) * 2;

      if (!todo.length) {
        this.emitProgress({ status: 'success', percent: 100, cached: this.listFor(request.firmwares) });
        return this.listFor(request.firmwares);
      }

      const auth = await this.resolveDeviceAuth(request.deviceUuid, request.baseUrl);

      for (const firmware of todo) {
        this.emitProgress({
          status: 'running',
          percent: Math.round((doneSteps / totalSteps) * 100),
          current: `${firmware.name || firmware.id} (manifest)`,
        });
        const manifestUrl = this.joinUrl(request.baseUrl, firmware.urls.manifest);
        const manifestTmp = await this.downloadOne(manifestUrl, auth, undefined, (percent) => {
          const base = doneSteps / totalSteps;
          const slice = percent / 100 / totalSteps;
          this.emitProgress({
            status: 'running',
            percent: Math.min(99, Math.round((base + slice) * 100)),
            current: `${firmware.name || firmware.id} (manifest)`,
          });
        });
        doneSteps += 1;

        this.emitProgress({
          status: 'running',
          percent: Math.round((doneSteps / totalSteps) * 100),
          current: `${firmware.name || firmware.id} (zip)`,
        });
        const zipUrl = this.joinUrl(request.baseUrl, firmware.urls.zip);
        const expectedHex = hashToDirName(firmware.hash);
        const zipTmp = await this.downloadOne(zipUrl, auth, expectedHex, (percent) => {
          const base = doneSteps / totalSteps;
          const slice = percent / 100 / totalSteps;
          this.emitProgress({
            status: 'running',
            percent: Math.min(99, Math.round((base + slice) * 100)),
            current: `${firmware.name || firmware.id} (zip)`,
          });
        });
        doneSteps += 1;

        await this.assertManifestMatchesDescriptor(manifestTmp, firmware);
        const entry = this.storePair(firmware, request, zipTmp, manifestTmp);
        cached.push(entry);
      }

      const all = this.listFor(request.firmwares);
      this.emitProgress({ status: 'success', percent: 100, cached: all });
      return all;
    } finally {
      this.downloading = false;
    }
  }

  private listFor(firmwares: FirmwareDescriptor[]): CachedFirmware[] {
    const byHash = new Map(this.list().map((item) => [normalizeHash(item.hash), item]));
    return firmwares
      .map((fw) => byHash.get(normalizeHash(fw.hash)))
      .filter((item): item is CachedFirmware => Boolean(item));
  }

  private async assertManifestMatchesDescriptor(
    manifestPath: string,
    firmware: FirmwareDescriptor,
  ): Promise<void> {
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as { hash?: string };
      if (!parsed?.hash) {
        return;
      }
      if (normalizeHash(parsed.hash) !== normalizeHash(firmware.hash)) {
        throw new Error(
          `Firmware manifest hash mismatch (manifest ${parsed.hash}, expected ${firmware.hash})`,
        );
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Firmware manifest is not valid JSON');
      }
      throw error;
    }
  }

  private async assertCachedFirmwareIntegrity(firmware: CachedFirmware): Promise<void> {
    if (!firmware.zipPath || !fs.existsSync(firmware.zipPath)) {
      throw new Error('Cached firmware zip is missing');
    }
    const digest = await generateSha256(firmware.zipPath);
    const expected = hashToDirName(firmware.hash);
    if (digest !== expected) {
      throw new Error(
        `Cached firmware checksum mismatch (expected ${expected.slice(0, 12)}…, got ${digest.slice(0, 12)}…). Re-download the firmware.`,
      );
    }
  }

  private storePair(
    firmware: FirmwareDescriptor,
    request: FirmwareDownloadRequest,
    zipTmp: string,
    manifestTmp: string,
  ): CachedFirmware {
    const dir = resolvePathInside(this.rootDir, asBasename(hashToDirName(firmware.hash)));
    fs.mkdirSync(dir, { recursive: true });

    const zipPath = resolvePathInside(dir, 'firmware.zip');
    const manifestPath = resolvePathInside(dir, 'firmware.manifest');
    fs.copyFileSync(zipTmp, zipPath);
    fs.copyFileSync(manifestTmp, manifestPath);
    try {
      fs.unlinkSync(zipTmp);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(manifestTmp);
    } catch {
      /* ignore */
    }

    const entry: CachedFirmware = {
      ...firmware,
      hash: normalizeHash(firmware.hash),
      deviceUuid: request.deviceUuid,
      module: request.module,
      cachedAt: Date.now(),
      zipPath,
      manifestPath,
    };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(entry, null, 2), 'utf8');
    return entry;
  }

  private async resolveDeviceAuth(
    deviceUuid: string,
    baseUrl: string,
  ): Promise<{ username: string; password: string } | undefined> {
    try {
      const host = new URL(baseUrl).hostname;
      const auth = await appAuth.resolveAuth(host, deviceUuid);
      if (auth?.account && typeof auth.password === 'string') {
        return { username: auth.account, password: auth.password };
      }
    } catch (error) {
      appLogger.warn('Unable to resolve device auth for firmware download', {
        deviceUuid,
        error,
      });
    }
    // Device may not require auth
    const device = appDevices.getDevice(deviceUuid);
    if (device?.auth) {
      throw new Error('Device authentication required to download firmware');
    }
    return undefined;
  }

  private joinUrl(baseUrl: string, relativePath: string): string {
    const base = baseUrl.replace(/\/+$/, '');
    const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return `${base}${rel}`;
  }

  private async downloadOne(
    url: string,
    auth: { username: string; password: string } | undefined,
    sha256Hex: string | undefined,
    onPercent: (percent: number) => void,
  ): Promise<string> {
    // Probe auth requirement with a quick HEAD when possible; fall back to GET stream.
    if (auth) {
      try {
        await axios.head(url, {
          auth,
          timeout: 10000,
          validateStatus: (status) => status < 500,
        });
      } catch {
        /* continue; downloadFile will surface the real error */
      }
    }

    return downloadFile(
      url,
      (progress) => {
        if (!progress.terminated) {
          onPercent(progress.percent || 0);
        }
      },
      sha256Hex,
      auth,
    );
  }

  public getByHash(hash: string): CachedFirmware | null {
    const normalized = normalizeHash(hash);
    return this.list().find((item) => normalizeHash(item.hash) === normalized) || null;
  }

  public async buildFlashPreview(request: FirmwareFlashRequest): Promise<FirmwareFlashPreview> {
    const firmware = this.getByHash(request.hash);
    if (!firmware) {
      throw new Error('Firmware is not in the local cache');
    }

    const resolved = await this.resolveFlashPaths(request);

    if (firmware.kind === 'micropython-app') {
      if (resolved.serialPath) {
        const ports = await listMicroPythonPorts();
        const serialPort = ports.find((item) => item.path === resolved.serialPath);
        if (serialPort && serialPort.accessible === false) {
          return {
            firmware,
            serialPort,
            warnings: [],
            errors: [],
            flashable: false,
            reason: serialPort.accessError || `Permission denied opening ${resolved.serialPath}`,
            mode: 'micropython-app',
          };
        }
        return {
          firmware,
          serialPort,
          warnings: [],
          errors: [],
          flashable: true,
          mode: 'micropython-app',
        };
      }
      if (resolved.mountPath) {
        const devices = await listBootselDevices();
        const device = devices.find((item) => item.mountPath === resolved.mountPath);
        const mismatch = splitMismatchNotes(firmware.targets, device);
        return {
          firmware,
          device,
          warnings: mismatch.warnings,
          errors: mismatch.errors,
          flashable: true,
          mode: 'micropython-app',
        };
      }
      // Storage mode / no serial yet — autoPrepare will guide BOOTSEL
      return {
        firmware,
        warnings: [],
        errors: [],
        flashable: true,
        mode: 'micropython-app',
      };
    }

    if (!UF2_KINDS.has(firmware.kind)) {
      return {
        firmware,
        warnings: [],
        errors: [],
        flashable: false,
        reason: `Firmware kind "${firmware.kind}" cannot be flashed.`,
        mode: 'uf2',
      };
    }

    if (resolved.mountPath) {
      const devices = await listBootselDevices();
      const device = devices.find((item) => item.mountPath === resolved.mountPath);
      const mismatch = splitMismatchNotes(firmware.targets, device);
      return {
        firmware,
        device,
        warnings: mismatch.warnings,
        errors: mismatch.errors,
        flashable: true,
        mode: 'uf2',
      };
    }

    return {
      firmware,
      warnings: [],
      errors: [],
      flashable: true,
      mode: 'uf2',
    };
  }

  /**
   * Unified flash entry: UF2 write and/or MicroPython app push with optional
   * automatic runtime preparation.
   */
  public async flashSmart(request: FirmwareFlashRequest): Promise<void> {
    if (this.flashing) {
      throw new Error('A firmware flash is already running');
    }
    if (!request?.hash) {
      throw new Error('Invalid flash request');
    }

    const firmware = this.getByHash(request.hash);
    if (!firmware) {
      throw new Error('Firmware is not in the local cache');
    }

    this.flashing = true;
    this.setBlocking(true);

    try {
      addPlatformBreadcrumb('pico-flash', 'Flash started', {
        kind: firmware.kind,
        hash: firmware.hash,
        targets: firmware.targets,
      });
      await this.assertCachedFirmwareIntegrity(firmware);
      if (firmware.kind === 'micropython-app') {
        await this.flashMicroPythonAppSmart(firmware, request);
      } else if (UF2_KINDS.has(firmware.kind)) {
        await this.flashUf2Smart(firmware, request);
      } else {
        throw new Error(`Firmware kind "${firmware.kind}" cannot be flashed.`);
      }
      addPlatformBreadcrumb('pico-flash', 'Flash completed', { hash: firmware.hash });
    } finally {
      this.flashing = false;
    }
  }

  /** @deprecated prefer flashSmart */
  public async flash(request: FirmwareFlashRequest): Promise<void> {
    return this.flashSmart(request);
  }

  /**
   * Erase Pico flash with the official universal flash-nuke UF2.
   * Requires BOOTSEL (uses selected storage volume or waits for one).
   */
  public async erasePico(request: FirmwareEraseRequest = {}): Promise<void> {
    if (this.flashing) {
      throw new Error('A firmware flash is already running');
    }

    this.flashing = true;
    this.setBlocking(true);

    try {
      addPlatformBreadcrumb('pico-erase', 'Erase started', {
        targetId: request.targetId,
        mountPath: request.mountPath,
      });
      const uf2Path = await ensureFlashNukeUf2((percent, current) => {
        this.emitFlashProgress({
          status: 'running',
          percent: Math.min(25, Math.round(percent * 0.25)),
          current,
        });
      });

      let mountPath = request.mountPath ? String(request.mountPath) : undefined;
      if (!mountPath && request.targetId) {
        const targets = await listPicoFlashTargets();
        const target = targets.find((item) => item.id === request.targetId);
        if (target?.kind === 'bootsel') {
          mountPath = target.mountPath;
        }
      }

      if (!mountPath) {
        this.emitFlashProgress({
          status: 'running',
          percent: 28,
          current: 'Hold the BOOTSEL button, then plug the Pico back in…',
        });
        const device = await this.waitForBootselDevice();
        mountPath = device.mountPath;
      }

      await this.flashRawUf2File(uf2Path, mountPath, 'Erasing flash…');
      this.emitFlashProgress({
        status: 'success',
        percent: 100,
        current: 'Flash erased. The Pico should return to storage mode.',
      });
    } finally {
      this.flashing = false;
    }
  }

  private async resolveFlashPaths(request: FirmwareFlashRequest): Promise<{
    mountPath?: string;
    serialPath?: string;
  }> {
    let mountPath = request.mountPath ? String(request.mountPath) : undefined;
    let serialPath = request.serialPath ? String(request.serialPath) : undefined;
    if (request.targetId) {
      const targets = await listPicoFlashTargets();
      const target = targets.find((item) => item.id === request.targetId);
      if (target?.kind === 'bootsel') {
        mountPath = target.mountPath;
      } else if (target?.kind === 'serial') {
        serialPath = target.serialPath;
      }
    }
    return { mountPath, serialPath };
  }

  private async waitForBootselDevice(
    preferredMount?: string,
    timeoutMs = 90000,
  ): Promise<PicoBootselDevice> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await tryAutomountBootselVolumes();
      const devices = await listBootselDevices();
      if (preferredMount) {
        const match = devices.find((d) => d.mountPath === preferredMount);
        if (match) {
          return match;
        }
      }
      if (devices.length === 1) {
        return devices[0];
      }
      if (devices.length > 1 && !preferredMount) {
        // Do not guess which board to flash when several BOOTSEL volumes are present.
        throw new Error(
          'Several Picos are in storage mode. Unplug the others, or select the target Pico first.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      'Timed out waiting for the Pico in storage mode. Hold BOOTSEL, plug the cable, then release BOOTSEL.',
    );
  }

  private async flashUf2Smart(firmware: CachedFirmware, request: FirmwareFlashRequest): Promise<void> {
    const resolved = await this.resolveFlashPaths(request);
    let mountPath = resolved.mountPath;
    if (!mountPath) {
      this.emitFlashProgress({
        status: 'running',
        percent: 2,
        current: 'Hold the BOOTSEL button, then plug the Pico back in…',
      });
      const device = await this.waitForBootselDevice();
      mountPath = device.mountPath;
    }
    await this.flashUf2(firmware, mountPath, 'Writing firmware…');
    this.emitFlashProgress({ status: 'success', percent: 100, current: 'Done' });
  }

  private async flashUf2(
    firmware: CachedFirmware,
    mountPath: string,
    progressLabel = 'Writing firmware…',
  ): Promise<void> {
    let uf2Path: string | null = null;
    try {
      this.emitFlashProgress({ status: 'running', percent: 5, current: progressLabel });
      uf2Path = await this.extractPayloadUf2(firmware);
      this.emitFlashProgress({ status: 'running', percent: 10, current: progressLabel });

      await flashUf2ToBootsel(mountPath, uf2Path, (progress) => {
        const percent = Math.min(99, 10 + Math.round((progress.percent || 0) * 0.85));
        this.emitFlashProgress({
          status: progress.error ? 'error' : 'running',
          percent: progress.terminated && !progress.error ? 99 : percent,
          current: progressLabel,
          error: progress.error,
        });
      });
    } finally {
      if (uf2Path) {
        try {
          fs.unlinkSync(uf2Path);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async flashRawUf2File(
    uf2Path: string,
    mountPath: string,
    progressLabel: string,
  ): Promise<void> {
    this.emitFlashProgress({ status: 'running', percent: 35, current: progressLabel });
    await flashUf2ToBootsel(mountPath, uf2Path, (progress) => {
      const percent = Math.min(70, 35 + Math.round((progress.percent || 0) * 0.35));
      this.emitFlashProgress({
        status: progress.error ? 'error' : 'running',
        percent,
        current: progressLabel,
        error: progress.error,
      });
    });
  }

  private async flashMicroPythonAppSmart(
    firmware: CachedFirmware,
    request: FirmwareFlashRequest,
  ): Promise<void> {
    const resolved = await this.resolveFlashPaths(request);
    let serialPath = resolved.serialPath;
    let needsRuntime = true;

    if (serialPath) {
      this.emitFlashProgress({
        status: 'running',
        percent: 3,
        current: 'Checking the Pico…',
      });
      needsRuntime = !(await probeMicroPython(serialPath));
    }

    if (needsRuntime) {
      let mountPath = resolved.mountPath;
      let bootselBoardId: string | undefined;
      if (mountPath) {
        const known = (await listBootselDevices()).find((item) => item.mountPath === mountPath);
        bootselBoardId = known?.boardId;
      } else {
        this.emitFlashProgress({
          status: 'running',
          percent: 32,
          current: 'Hold the BOOTSEL button, then plug the Pico back in…',
        });
        const device = await this.waitForBootselDevice();
        mountPath = device.mountPath;
        bootselBoardId = device.boardId;
      }

      const variant = selectRuntimeVariant(firmware.targets, bootselBoardId);
      const runtime = await ensureMicroPythonRuntime(variant, (percent, current) => {
        this.emitFlashProgress({
          status: 'running',
          percent: Math.min(55, 35 + Math.round(percent * 0.2)),
          current,
        });
      });

      await this.flashRawUf2File(runtime.uf2Path, mountPath, 'Preparing the board…');

      this.emitFlashProgress({
        status: 'running',
        percent: 72,
        current: 'Waiting for the Pico to restart…',
      });
      const port = await waitForMicroPythonPort(60000);
      serialPath = port.path;
    }

    if (!serialPath) {
      throw new Error('No Pico serial port available to install the application');
    }

    await this.flashMicroPythonApp(firmware, serialPath);
    this.emitFlashProgress({ status: 'success', percent: 100, current: 'Done' });
  }

  private async flashMicroPythonApp(firmware: CachedFirmware, serialPath: string): Promise<void> {
    const extractDir = path.join(
      app.getPath('temp'),
      `cleep-pico-mpy-${hashToDirName(firmware.hash)}`,
    );
    try {
      this.emitFlashProgress({
        status: 'running',
        percent: 75,
        current: 'Installing application…',
      });
      fs.rmSync(extractDir, { recursive: true, force: true });
      fs.mkdirSync(extractDir, { recursive: true });
      await extractZipArchive(firmware.zipPath, extractDir);
      const filesDir = path.join(extractDir, FILES_DIR);
      if (!fs.existsSync(filesDir)) {
        throw new Error('Firmware package has no application files');
      }

      await pushFilesToMicroPython(serialPath, filesDir, (progress) => {
        const percent = Math.min(99, 75 + Math.round((progress.percent || 0) * 0.24));
        this.emitFlashProgress({
          status: progress.error ? 'error' : 'running',
          percent: progress.terminated && !progress.error ? 99 : percent,
          current: 'Installing application…',
          error: progress.error,
        });
      });
    } finally {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private async extractPayloadUf2(firmware: CachedFirmware): Promise<string> {
    const zipPath = firmware.zipPath;
    if (!fs.existsSync(zipPath)) {
      throw new Error('Cached firmware zip is missing');
    }

    const directory = await Open.file(zipPath);
    const entry = directory.files.find(
      (file) => file.type !== 'Directory' && file.path.replace(/\\/g, '/') === PAYLOAD_UF2,
    );
    if (!entry) {
      throw new Error(`Firmware zip does not contain ${PAYLOAD_UF2}`);
    }

    const tmpPath = path.join(
      app.getPath('temp'),
      `cleep-pico-${hashToDirName(firmware.hash)}.uf2`,
    );
    const content = await entry.buffer();
    fs.writeFileSync(tmpPath, content);
    return tmpPath;
  }

  private emitProgress(progress: FirmwareDownloadProgress): void {
    if (!this.window) {
      return;
    }
    sendToRenderer(this.window, 'firmware-download-progress', progress);
  }

  private emitFlashProgress(progress: FirmwareFlashProgress): void {
    if (!this.window) {
      return;
    }
    sendToRenderer(this.window, 'firmware-flash-progress', progress);
  }
}

export const appFirmware = new AppFirmware();

/** Test helper: hash helpers without constructing the class. */
export const firmwareHashHelpers = {
  normalizeHash,
  hashToDirName,
  generateSha256,
};
