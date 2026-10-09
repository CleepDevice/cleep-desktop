import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { asBasename, assertPathInside, isSafeObjectKey, resolvePathInside } from '../../src/utils/safe-path';

describe('safe-path', () => {
  it('resolves paths that stay inside the root', () => {
    const root = path.join(os.tmpdir(), 'cleep-root');
    expect(resolvePathInside(root, 'a', 'b.txt')).toBe(path.normalize(path.join(root, 'a', 'b.txt')));
  });

  it('rejects zip-slip / traversal segments', () => {
    const root = path.join(os.tmpdir(), 'cleep-root');
    expect(() => resolvePathInside(root, '..', 'etc', 'passwd')).toThrow(/escapes|Invalid path/);
    expect(() => resolvePathInside(root, 'ok', '..', '..', 'etc')).toThrow(/escapes|Invalid path/);
  });

  it('rejects absolute zip entry paths', () => {
    const root = path.join(os.tmpdir(), 'cleep-root');
    expect(() => resolvePathInside(root, path.resolve(os.tmpdir(), 'outside'))).toThrow(/escapes|Invalid path/);
  });

  it('rejects relative roots', () => {
    expect(() => resolvePathInside('relative-root', 'a.txt')).toThrow(/absolute/);
  });

  it('assertPathInside accepts contained paths', () => {
    const root = path.join(os.tmpdir(), 'cleep-root');
    const inside = path.join(root, 'file.txt');
    expect(assertPathInside(root, inside)).toBe(path.normalize(inside));
  });

  it('asBasename strips directory components', () => {
    expect(asBasename('archive.zip')).toBe('archive.zip');
    expect(asBasename('../archive.zip')).toBe('archive.zip');
    expect(asBasename(path.join('tmp', 'evil', 'archive.zip'))).toBe('archive.zip');
  });

  it('rejects prototype-pollution object keys', () => {
    expect(isSafeObjectKey('settings')).toBe(true);
    expect(isSafeObjectKey('__proto__')).toBe(false);
    expect(isSafeObjectKey('constructor')).toBe(false);
    expect(isSafeObjectKey('prototype')).toBe(false);
  });
});
