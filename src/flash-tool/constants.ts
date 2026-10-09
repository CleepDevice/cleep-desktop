import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { resolvePathInside } from '../utils/safe-path';
import rpiImagerVersions from './rpi-imager-versions.json';

/**
 * Bundle version published on CleepDevice/cleep-desktop as tag `rpi-imager-v${RPI_IMAGER_VERSION}`.
 * Per-platform official sources may differ (see rpi-imager-versions.json).
 */
export const RPI_IMAGER_VERSION = rpiImagerVersions.bundle;

/** Official raspberrypi/rpi-imager versions used when packaging each platform zip. */
export const RPI_IMAGER_SOURCE_VERSIONS = rpiImagerVersions.sources;

/** Directory where the downloaded rpi-imager binary is extracted. */
export const RPI_IMAGER_DIR = path.join(app.getPath('userData'), 'rpi-imager');

export function getFlashWrapperFilename(): string {
  if (process.platform === 'win32') {
    return 'flash.windows.bat';
  }
  if (process.platform === 'darwin') {
    return 'flash.macos.sh';
  }
  return 'flash.linux.sh';
}

/**
 * Resolve the elevated flash wrapper shipped with the app (outside asar when packaged).
 */
export function getFlashWrapperPath(): string {
  const filename = getFlashWrapperFilename();
  const candidates: string[] = [];

  const addUnder = (root: string, ...segments: string[]) => {
    if (!root || segments.some((segment) => typeof segment !== 'string' || segment.length === 0)) {
      return;
    }
    try {
      candidates.push(resolvePathInside(root, ...segments));
    } catch {
      // skip paths that would escape the root
    }
  };

  if (typeof process.resourcesPath === 'string') {
    addUnder(process.resourcesPath, 'flashtool', filename);
  }

  let appPath = '';
  try {
    appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : '';
  } catch {
    appPath = '';
  }
  if (appPath) {
    addUnder(appPath, 'resources', 'flashtool', filename);
    addUnder(path.resolve(appPath, '..'), 'resources', 'flashtool', filename);
  }

  addUnder(path.resolve(__dirname, '..', '..'), 'resources', 'flashtool', filename);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Flash wrapper not found (${filename})`);
}
