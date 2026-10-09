import path from 'path';

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Split a relative path into safe basename components.
 * Rejects absolute paths, null bytes, and `..` (zip-slip / traversal).
 */
function toSafeRelativeParts(segment: string): string[] {
  if (typeof segment !== 'string' || segment.length === 0) {
    throw new Error('Invalid path segment');
  }
  if (segment.includes('\0')) {
    throw new Error('Path contains null byte');
  }
  if (path.isAbsolute(segment)) {
    throw new Error(`Path escapes root directory: ${segment}`);
  }

  const parts: string[] = [];
  for (const part of segment.split(/[/\\]/)) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      throw new Error(`Path escapes root directory: ${segment}`);
    }
    const safe = path.basename(part);
    if (safe !== part || safe === '.' || safe === '..') {
      throw new Error(`Path escapes root directory: ${segment}`);
    }
    parts.push(safe);
  }
  return parts;
}

/** Codacy/OWASP style base dir with trailing separator for startsWith checks. */
export function toBasePath(rootDir: string): string {
  const root = path.normalize(rootDir);
  if (!path.isAbsolute(root)) {
    throw new Error('Root directory must be absolute');
  }
  return root.endsWith(path.sep) ? root : root + path.sep;
}

/**
 * Ensure `candidate` stays under `rootDir` (normalize + startsWith).
 * Matches Codacy File Access guidance.
 */
export function assertPathInside(rootDir: string, candidate: string): string {
  const basePath = toBasePath(rootDir);
  const root = path.normalize(rootDir);
  const fullPath = path.normalize(candidate);
  if (fullPath !== root && !fullPath.startsWith(basePath)) {
    throw new Error('Invalid path specified!');
  }
  return fullPath;
}

/**
 * Join path segments under `rootDir` and throw if the result escapes the root.
 * Builds the path via basename-only concatenation (no path.join with user input).
 */
export function resolvePathInside(rootDir: string, ...segments: string[]): string {
  const root = path.normalize(rootDir);
  if (!path.isAbsolute(root)) {
    throw new Error('Root directory must be absolute');
  }

  let fullPath = root;
  for (const segment of segments) {
    for (const part of toSafeRelativeParts(segment)) {
      fullPath = path.normalize(fullPath + path.sep + part);
    }
  }

  return assertPathInside(root, fullPath);
}

/** Strip directories — only the final name component is kept. */
export function asBasename(filename: string): string {
  if (typeof filename !== 'string' || filename.length === 0 || filename.includes('\0')) {
    throw new Error('Invalid filename');
  }
  const base = path.basename(filename);
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid filename');
  }
  return base;
}

export function isSafeObjectKey(key: string): boolean {
  return Boolean(key) && !PROTOTYPE_POLLUTION_KEYS.has(key);
}
