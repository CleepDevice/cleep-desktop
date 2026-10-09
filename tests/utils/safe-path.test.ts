import path from 'path';
import { describe, expect, it } from 'vitest';
import { asBasename, isSafeObjectKey, resolvePathInside } from '../../src/utils/safe-path';

describe('safe-path', () => {
  it('resolves paths that stay inside the root', () => {
    const root = path.join('/tmp', 'cleep-root');
    expect(resolvePathInside(root, 'a', 'b.txt')).toBe(path.join(root, 'a', 'b.txt'));
  });

  it('rejects zip-slip / traversal segments', () => {
    const root = path.join('/tmp', 'cleep-root');
    expect(() => resolvePathInside(root, '..', 'etc', 'passwd')).toThrow(/escapes/);
    expect(() => resolvePathInside(root, 'ok', '..', '..', 'etc')).toThrow(/escapes/);
  });

  it('rejects absolute zip entry paths', () => {
    const root = path.join('/tmp', 'cleep-root');
    expect(() => resolvePathInside(root, '/etc/passwd')).toThrow(/escapes/);
  });

  it('asBasename strips directory components', () => {
    expect(asBasename('archive.zip')).toBe('archive.zip');
    expect(asBasename('../archive.zip')).toBe('archive.zip');
    expect(asBasename('/tmp/evil/archive.zip')).toBe('archive.zip');
  });

  it('rejects prototype-pollution object keys', () => {
    expect(isSafeObjectKey('settings')).toBe(true);
    expect(isSafeObjectKey('__proto__')).toBe(false);
    expect(isSafeObjectKey('constructor')).toBe(false);
    expect(isSafeObjectKey('prototype')).toBe(false);
  });
});
