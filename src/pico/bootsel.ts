import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import * as drivelist from 'drivelist';
import { appLogger } from '../app-logger';

const execFileAsync = promisify(execFile);

export type PicoFamily = 'rp2040' | 'rp2350' | 'unknown';

export interface PicoBootselDevice {
  /** Absolute mount path of the BOOTSEL volume */
  mountPath: string;
  /** Raw Board-ID from INFO_UF2.TXT when present */
  boardId: string;
  family: PicoFamily;
  label: string;
  device: string;
  description: string;
}

const BOOTSEL_LABELS = new Set(['RPI-RP2', 'RP2350', 'RP2350BOOT']);

const RP2040_TARGETS = new Set(['pico', 'pico_h', 'pico_w']);
const RP2350_TARGETS = new Set(['pico2', 'pico2_h', 'pico2_w']);
const WIFI_TARGETS = new Set(['pico_w', 'pico2_w']);
const HEADER_TARGETS = new Set(['pico_h', 'pico2_h']);

/**
 * Parse Raspberry Pi UF2 bootloader INFO_UF2.TXT.
 */
export function parseInfoUf2(content: string): { boardId: string; family: PicoFamily } {
  const text = String(content || '');
  const boardMatch = text.match(/Board-ID:\s*(\S+)/i);
  const boardId = (boardMatch?.[1] || '').trim().toUpperCase();
  return { boardId, family: familyFromBoardId(boardId) };
}

export function familyFromBoardId(boardId: string): PicoFamily {
  const id = String(boardId || '').toUpperCase();
  if (id.includes('RP2350') || id === 'RPI-RP2350') {
    return 'rp2350';
  }
  if (id.includes('RP2') || id === 'RPI-RP2') {
    return 'rp2040';
  }
  return 'unknown';
}

function looksLikeBootselLabel(label: string): boolean {
  const normalized = String(label || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
  if (BOOTSEL_LABELS.has(normalized)) {
    return true;
  }
  return normalized.includes('RPI-RP2') || normalized.includes('RP2350');
}

function readBootselInfo(mountPath: string): { boardId: string; family: PicoFamily } {
  const infoPath = path.join(mountPath, 'INFO_UF2.TXT');
  if (!fs.existsSync(infoPath)) {
    // Volume label alone is a strong signal
    const label = path.basename(mountPath);
    if (looksLikeBootselLabel(label)) {
      return { boardId: label.toUpperCase(), family: familyFromBoardId(label) };
    }
    return { boardId: '', family: 'unknown' };
  }
  try {
    return parseInfoUf2(fs.readFileSync(infoPath, 'utf8'));
  } catch (error) {
    appLogger.warn('Unable to read INFO_UF2.TXT', { mountPath, error });
    return { boardId: '', family: 'unknown' };
  }
}

export type BootselAutomountAttempt = {
  label: string;
  byLabelPath: string;
  ok: boolean;
  /** True when the volume appears already mounted (udisks "AlreadyMounted" / similar). */
  alreadyMounted?: boolean;
  errorMessage?: string;
};

export type BootselAutomountResult = {
  platform: NodeJS.Platform;
  attempted: boolean;
  /** Labels that exist under /dev/disk/by-label before/during the attempt. */
  detectedLabels: string[];
  attempts: BootselAutomountAttempt[];
};

const BOOTSEL_LINUX_LABELS = ['RPI-RP2', 'RP2350', 'RP2350BOOT'];

function formatExecError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error || 'unknown error');
  }
  const err = error as { stderr?: string | Buffer; message?: string; code?: string | number };
  const stderr = err.stderr
    ? Buffer.isBuffer(err.stderr)
      ? err.stderr.toString('utf8')
      : String(err.stderr)
    : '';
  return (stderr || err.message || String(error)).trim();
}

function isAlreadyMountedMessage(message: string): boolean {
  return /already mounted|already.?mount/i.test(message);
}

/**
 * On Linux, try to automount known Pico BOOTSEL volume labels via udisks.
 * No-op on other platforms. Returns structured diagnostics for UI / Sentry.
 */
export async function tryAutomountBootselVolumes(): Promise<BootselAutomountResult> {
  const result: BootselAutomountResult = {
    platform: process.platform,
    attempted: false,
    detectedLabels: [],
    attempts: [],
  };

  if (process.platform !== 'linux') {
    return result;
  }

  result.attempted = true;
  for (const label of BOOTSEL_LINUX_LABELS) {
    const byLabel = `/dev/disk/by-label/${label}`;
    if (!fs.existsSync(byLabel)) {
      continue;
    }
    result.detectedLabels.push(label);
    try {
      await execFileAsync('udisksctl', ['mount', '-b', byLabel], { timeout: 8000 });
      appLogger.info('Automounted Pico BOOTSEL volume', { label });
      result.attempts.push({ label, byLabelPath: byLabel, ok: true });
    } catch (error) {
      const errorMessage = formatExecError(error);
      const alreadyMounted = isAlreadyMountedMessage(errorMessage);
      if (alreadyMounted) {
        appLogger.debug('udisksctl reports volume already mounted', { label });
        result.attempts.push({
          label,
          byLabelPath: byLabel,
          ok: true,
          alreadyMounted: true,
          errorMessage,
        });
      } else {
        appLogger.warn('udisksctl mount failed for Pico BOOTSEL volume', {
          label,
          errorMessage,
        });
        result.attempts.push({
          label,
          byLabelPath: byLabel,
          ok: false,
          errorMessage,
        });
      }
    }
  }

  return result;
}

/**
 * Linux-only: BOOTSEL labels present in /dev/disk/by-label but not yet usable as mounts.
 */
export function listUnmountedBootselLabels(
  automount: BootselAutomountResult,
  mountedLabels: Set<string>,
): string[] {
  if (automount.platform !== 'linux') {
    return [];
  }
  return automount.detectedLabels.filter((label) => {
    const upper = label.toUpperCase();
    for (const mounted of mountedLabels) {
      if (mounted.toUpperCase() === upper || mounted.toUpperCase().includes(upper)) {
        return false;
      }
    }
    // If mount attempt said already-mounted / ok, treat as mounted even if listing lagged.
    const attempt = automount.attempts.find((item) => item.label === label);
    if (attempt?.ok) {
      return false;
    }
    return true;
  });
}

export function describeUnmountedBootsel(labels: string[]): string {
  const joined = labels.join(', ');
  return (
    `Pico storage volume detected (${joined}) but not mounted. ` +
    'On Linux, install/enable udisks2 and allow mounting removable drives ' +
    `(udisksctl mount -b /dev/disk/by-label/${labels[0]}), then rescan.`
  );
}

/**
 * List Pico boards currently in BOOTSEL (UF2 mass-storage) mode.
 * Pass ``automount: false`` when the caller already ran {@link tryAutomountBootselVolumes}.
 */
export async function listBootselDevices(
  options: { automount?: boolean } = {},
): Promise<PicoBootselDevice[]> {
  if (options.automount !== false) {
    await tryAutomountBootselVolumes();
  }

  const drives = await drivelist.list();
  const found: PicoBootselDevice[] = [];

  for (const drive of drives) {
    if (drive.error || !drive.isUSB) {
      continue;
    }
    const mountpoints = drive.mountpoints || [];
    for (const mp of mountpoints) {
      const mountPath = mp?.path;
      if (!mountPath || !fs.existsSync(mountPath)) {
        continue;
      }
      const label = (mp as { label?: string }).label || path.basename(mountPath);
      const info = readBootselInfo(mountPath);
      const hasInfoFile = fs.existsSync(path.join(mountPath, 'INFO_UF2.TXT'));
      const hasLabel = looksLikeBootselLabel(label) || looksLikeBootselLabel(drive.description || '');
      if (!hasInfoFile && !hasLabel) {
        continue;
      }
      found.push({
        mountPath,
        boardId: info.boardId || String(label).toUpperCase(),
        family: info.family !== 'unknown' ? info.family : familyFromBoardId(label),
        label: String(label),
        device: drive.device || '',
        description: drive.description || '',
      });
    }
  }

  return found;
}

/**
 * Soft mismatch warnings between firmware targets and a detected BOOTSEL board.
 * Never blocks flashing — caller shows warnings and continues.
 */
export type FirmwareMismatchLevel = 'warning' | 'error';

export interface FirmwareMismatchNote {
  level: FirmwareMismatchLevel;
  message: string;
}

/**
 * Compare firmware target hints with a BOOTSEL board.
 * - ``error``: high risk of a dead/unbootable flash (wrong MCU family)
 * - ``warning``: supplier advice that cannot be verified in BOOTSEL (Wi-Fi, headers, unknown id)
 */
export function buildMismatchNotes(
  targets: string[] | undefined,
  device: PicoBootselDevice,
): FirmwareMismatchNote[] {
  const wanted = (targets || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  if (!wanted.length) {
    return [];
  }

  const notes: FirmwareMismatchNote[] = [];
  const wantsRp2040 = wanted.some((t) => RP2040_TARGETS.has(t));
  const wantsRp2350 = wanted.some((t) => RP2350_TARGETS.has(t));
  const wantsWifi = wanted.some((t) => WIFI_TARGETS.has(t));
  const wantsHeaders = wanted.some((t) => HEADER_TARGETS.has(t));

  if (device.family === 'rp2040' && wantsRp2350 && !wantsRp2040) {
    notes.push({
      level: 'error',
      message:
        'Firmware targets Pico 2 (RP2350) but the connected board looks like Pico (RP2040). It will likely not boot.',
    });
  }
  if (device.family === 'rp2350' && wantsRp2040 && !wantsRp2350) {
    notes.push({
      level: 'error',
      message:
        'Firmware targets Pico (RP2040) but the connected board looks like Pico 2 (RP2350). Prefer a Pico 2 build.',
    });
  }
  if (wantsWifi) {
    notes.push({
      level: 'warning',
      message:
        'This firmware expects Wi-Fi (Pico W / Pico 2 W). Storage mode cannot verify the wireless variant — confirm the board has Wi-Fi.',
    });
  }
  if (wantsHeaders) {
    notes.push({
      level: 'warning',
      message:
        'This firmware targets a board with headers (…_h). Confirm the physical board matches.',
    });
  }
  if (device.family === 'unknown') {
    notes.push({
      level: 'warning',
      message:
        'Could not fully identify the Pico model from storage-mode info. Double-check before flashing.',
    });
  }

  return notes;
}

/** @deprecated Prefer {@link buildMismatchNotes}; kept for callers expecting strings. */
export function buildMismatchWarnings(
  targets: string[] | undefined,
  device: PicoBootselDevice,
): string[] {
  return buildMismatchNotes(targets, device).map((note) => note.message);
}

export type FlashUf2Progress = {
  percent: number;
  terminated: boolean;
  error?: string;
};

/**
 * Copy a UF2 onto a BOOTSEL volume. The Pico usually remounts/disconnects when
 * the write completes — treat disappearing mount after a successful write as OK.
 */
export async function flashUf2ToBootsel(
  mountPath: string,
  uf2Path: string,
  onProgress?: (progress: FlashUf2Progress) => void,
): Promise<void> {
  if (!fs.existsSync(mountPath)) {
    throw new Error('BOOTSEL volume is no longer available');
  }
  if (!fs.existsSync(uf2Path)) {
    throw new Error('UF2 file not found');
  }

  const destName = path.basename(uf2Path).toLowerCase().endsWith('.uf2')
    ? path.basename(uf2Path)
    : 'firmware.uf2';
  const destPath = path.join(mountPath, destName);
  const total = fs.statSync(uf2Path).size;
  if (total <= 0) {
    throw new Error('UF2 file is empty');
  }

  await new Promise<void>((resolve, reject) => {
    const reader = fs.createReadStream(uf2Path);
    const writer = fs.createWriteStream(destPath);
    let transferred = 0;
    let settled = false;

    const finishOk = () => {
      if (settled) {
        return;
      }
      settled = true;
      onProgress?.({ percent: 100, terminated: true });
      resolve();
    };

    const finishErr = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      // Pico often ejects mid-flush once the UF2 is accepted.
      const code = (error as NodeJS.ErrnoException).code;
      if (
        transferred >= total * 0.95 &&
        (code === 'ENOENT' || code === 'EIO' || code === 'ENODEV' || code === 'EACCES')
      ) {
        appLogger.info('BOOTSEL volume disappeared after UF2 write — treating as success', {
          transferred,
          total,
          code,
        });
        onProgress?.({ percent: 100, terminated: true });
        resolve();
        return;
      }
      onProgress?.({ percent: Math.round((transferred / total) * 100), terminated: true, error: error.message });
      reject(error);
    };

    reader.on('data', (chunk: Buffer | string) => {
      const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      transferred += size;
      onProgress?.({
        percent: Math.min(99, Math.round((transferred / total) * 100)),
        terminated: false,
      });
    });
    reader.on('error', finishErr);
    writer.on('error', finishErr);
    writer.on('close', finishOk);
    reader.pipe(writer);
  });
}
