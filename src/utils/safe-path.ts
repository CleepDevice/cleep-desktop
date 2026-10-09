import path from 'path';

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Join path segments under `rootDir` and throw if the result escapes the root
 * (zip-slip / path traversal).
 */
export function resolvePathInside(rootDir: string, ...segments: string[]): string {
  const root = path.resolve(rootDir);

  for (const segment of segments) {
    if (typeof segment !== 'string' || segment.length === 0) {
      throw new Error('Invalid path segment');
    }
    if (segment.includes('\0')) {
      throw new Error('Path contains null byte');
    }
  }

  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes root directory: ${segments.join('/')}`);
  }

  return resolved;
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
