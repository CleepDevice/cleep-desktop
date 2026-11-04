import fs from 'fs';
import path from 'path';

/** Folder name under developer sources for the Cleep core repository. */
export const CLEEP_CORE_FOLDER_NAME = 'cleep';

/** Synthetic folderName used by sync-now IPC to target core only. */
export const DEVELOPER_CORE_SYNC_TOKEN = '__cleep_core__';

/**
 * True when ``dir`` looks like the Cleep core git checkout (setup.py + package ``cleep/``).
 */
export function isCleepCoreDir(dir: string): boolean {
  const root = String(dir || '').trim();
  if (!root) {
    return false;
  }
  try {
    if (!fs.statSync(root).isDirectory()) {
      return false;
    }
    if (!fs.statSync(path.join(root, 'setup.py')).isFile()) {
      return false;
    }
    return fs.statSync(path.join(root, 'cleep')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Absolute path to ``<sourcesDir>/cleep`` when it is a valid core checkout, else null.
 */
export function detectCleepCoreDir(sourcesDir: string): string | null {
  const root = String(sourcesDir || '').trim();
  if (!root) {
    return null;
  }
  const candidate = path.join(root, CLEEP_CORE_FOLDER_NAME);
  return isCleepCoreDir(candidate) ? candidate : null;
}
