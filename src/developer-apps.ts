import fs from 'fs';
import path from 'path';
import { CLEEP_CORE_FOLDER_NAME, isCleepCoreDir } from './developer-core';

/** One immediate child of the configured sources folder. */
export type DeveloperAppEntry = {
  /** Folder name under the sources root. */
  folderName: string;
  absolutePath: string;
  /** True when backend contains a Cleep*Module class. */
  valid: boolean;
  /** Module name for /root/cleep-dev/modules/<moduleName>/ (lowercase class). */
  moduleName: string | null;
  /** Human label, e.g. "cleepapp-developer → developer". */
  label: string;
  /** MDI icon name from ``frontend/desc.json`` (fallback ``puzzle``). */
  icon: string;
};

/** App base classes from cleep.core (explicit allowlist; not a bare Cleep* prefix). */
const CLEEP_APP_BASE_CLASSES =
  'CleepModule|CleepResources|CleepRenderer|CleepExternalBus|CleepRemoteAccessModule';

const CLEEP_MODULE_CLASS_RE = new RegExp(
  String.raw`^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([^)]*(?:${CLEEP_APP_BASE_CLASSES})[^)]*)\)\s*:`,
  'm',
);

/**
 * Detect the Cleep module name from a local application folder.
 * Looks for `class Foo(<Cleep app base>)` under backend/*.py.
 */
export function detectModuleName(appDir: string): string | null {
  const backendDir = path.join(appDir, 'backend');
  let entries: string[];
  try {
    if (!fs.statSync(backendDir).isDirectory()) {
      return null;
    }
    entries = fs.readdirSync(backendDir);
  } catch {
    return null;
  }

  const pyFiles = entries.filter((name) => name.endsWith('.py') && name !== '__init__.py');
  const matches: Array<{ className: string; fileName: string }> = [];

  for (const fileName of pyFiles) {
    let source: string;
    try {
      source = fs.readFileSync(path.join(backendDir, fileName), 'utf8');
    } catch {
      continue;
    }
    const match = source.match(CLEEP_MODULE_CLASS_RE);
    if (!match) {
      continue;
    }
    matches.push({ className: match[1], fileName });
  }

  if (matches.length === 0) {
    return null;
  }

  const preferred = matches.find(
    (item) => item.fileName.toLowerCase() === `${item.className.toLowerCase()}.py`,
  );
  const chosen = preferred || matches[0];
  return chosen.className.toLowerCase();
}

export function isValidCleepAppDir(appDir: string): boolean {
  return detectModuleName(appDir) !== null;
}

const DEFAULT_APP_ICON = 'puzzle';

/** MDI icon declared in ``frontend/desc.json``, else null. */
export function detectAppIcon(appDir: string): string | null {
  const descPath = path.join(appDir, 'frontend', 'desc.json');
  try {
    const raw = JSON.parse(fs.readFileSync(descPath, 'utf8')) as { icon?: unknown };
    const icon = typeof raw.icon === 'string' ? raw.icon.trim() : '';
    return icon || null;
  } catch {
    return null;
  }
}

/** List immediate subfolders of sourcesDir and classify each as cleepapp or not. */
export function listDeveloperApps(sourcesDir: string): DeveloperAppEntry[] {
  const root = String(sourcesDir || '').trim();
  if (!root) {
    return [];
  }

  let names: string[];
  try {
    if (!fs.statSync(root).isDirectory()) {
      return [];
    }
    names = fs.readdirSync(root);
  } catch {
    return [];
  }

  const entries: DeveloperAppEntry[] = [];
  for (const folderName of names) {
    if (folderName.startsWith('.')) {
      continue;
    }
    const absolutePath = path.join(root, folderName);
    let isDir = false;
    try {
      isDir = fs.statSync(absolutePath).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) {
      continue;
    }
    // Cleep core lives beside apps under sources; synced separately, not as a module.
    if (folderName === CLEEP_CORE_FOLDER_NAME || isCleepCoreDir(absolutePath)) {
      continue;
    }

    const moduleName = detectModuleName(absolutePath);
    const valid = Boolean(moduleName);
    const label =
      valid && moduleName && moduleName !== folderName.toLowerCase()
        ? `${folderName} → ${moduleName}`
        : folderName;
    const icon = (valid ? detectAppIcon(absolutePath) : null) || DEFAULT_APP_ICON;

    entries.push({
      folderName,
      absolutePath,
      valid,
      moduleName,
      label,
      icon,
    });
  }

  entries.sort((a, b) => a.folderName.localeCompare(b.folderName));
  return entries;
}

/**
 * Resolve selected folder names to valid apps only.
 * Drops unknown / invalid folders from the selection.
 */
export function resolveSelectedDeveloperApps(
  sourcesDir: string,
  selectedFolderNames: string[],
): DeveloperAppEntry[] {
  const selected = new Set((selectedFolderNames || []).map((name) => String(name)));
  return listDeveloperApps(sourcesDir).filter(
    (entry) => entry.valid && entry.moduleName && selected.has(entry.folderName),
  );
}

/**
 * Local folder for a remote module name.
 * Prefers an existing valid app whose moduleName matches; otherwise ``<sources>/<moduleName>``.
 */
export function resolveLocalPathForModule(sourcesDir: string, moduleName: string): string {
  const root = String(sourcesDir || '').trim();
  const module = String(moduleName || '').trim();
  if (!root || !module) {
    throw new Error('Sources directory and module name are required');
  }
  const existing = listDeveloperApps(root).find(
    (entry) => entry.valid && entry.moduleName === module,
  );
  if (existing) {
    return existing.absolutePath;
  }
  return path.join(root, module);
}
