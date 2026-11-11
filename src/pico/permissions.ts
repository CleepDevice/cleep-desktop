import fs from 'fs';
import { SerialPort } from 'serialport';
import { RPI_USB_VID, checkSerialPortAccess, describeSerialAccessError } from './micropython';

export interface FirmwarePermissionStatus {
  ok: boolean;
  platform: NodeJS.Platform;
  serialOk: boolean;
  message?: string;
}

function normalizeVid(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^0X/, '');
}

/**
 * Preflight serial/USB access for Pico flashing.
 * Linux typically needs membership in the ``dialout`` group.
 */
export async function checkFirmwarePermissions(): Promise<FirmwarePermissionStatus> {
  const platform = process.platform;
  const ports = await SerialPort.list();
  const picoPorts = ports.filter((port) => normalizeVid(port.vendorId) === RPI_USB_VID);

  if (!picoPorts.length) {
    // No Pico plugged — permissions cannot be proven yet, but Linux dialout
    // is still worth checking via a synthetic message only when we know user lacks group.
    // Without a device, treat as OK so the UI stays usable until selection time.
    return { ok: true, platform, serialOk: true };
  }

  for (const port of picoPorts) {
    const access = await checkSerialPortAccess(port.path);
    if (!access.ok) {
      return {
        ok: false,
        platform,
        serialOk: false,
        message: access.error || describeSerialAccessError(port.path, { code: 'EACCES' }),
      };
    }
  }

  return { ok: true, platform, serialOk: true };
}

/**
 * Platform-specific guidance when a given serial path cannot be opened.
 */
export function serialPermissionHelp(serialPath: string, error?: unknown): string {
  if (error) {
    return describeSerialAccessError(serialPath, error);
  }
  if (process.platform === 'linux') {
    return (
      `Permission denied opening ${serialPath}. ` +
      'On Linux, add your user to the "dialout" group, then log out and back in: ' +
      'sudo usermod -aG dialout $USER'
    );
  }
  if (process.platform === 'darwin') {
    return (
      `Permission denied opening ${serialPath}. ` +
      'Quit any other app using this serial port, unplug the Pico, then plug it back in.'
    );
  }
  return (
    `Permission denied opening ${serialPath}. ` +
    'Close any other application using this COM port, then unplug and replug the Pico.'
  );
}

/** Test helper: check access on an arbitrary path. */
export async function pathIsWritable(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
