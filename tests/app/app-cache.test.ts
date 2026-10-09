import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppCache, appCache } from '../../src/app-cache';
import { appLogger } from '../../src/app-logger';
import { ipcHandleHandlers, USER_DATA_DIR } from '../setup';

const cacheDir = path.join(USER_DATA_DIR, 'file-cache');

function cleanCacheDir(): void {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    return;
  }
  for (const file of fs.readdirSync(cacheDir)) {
    fs.rmSync(path.join(cacheDir, file), { force: true, recursive: true });
  }
}

describe('AppCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanCacheDir();
  });

  it('creates cache directory on construction when missing', () => {
    const isolatedUserData = path.join(os.tmpdir(), `cleep-cache-ctor-${Date.now()}`);
    const isolatedCacheDir = path.join(isolatedUserData, 'file-cache');
    fs.mkdirSync(isolatedUserData, { recursive: true });
    vi.spyOn(app, 'getPath').mockReturnValue(isolatedUserData);

    // preserve singleton ipc handlers overwritten by a new AppCache instance
    const previousHandlers = {
      getInfos: ipcHandleHandlers.get('cache-get-infos'),
      deleteFile: ipcHandleHandlers.get('cache-delete-file'),
      purgeFiles: ipcHandleHandlers.get('cache-purge-files'),
    };

    expect(fs.existsSync(isolatedCacheDir)).toBe(false);
    new AppCache();
    expect(fs.existsSync(isolatedCacheDir)).toBe(true);

    ipcHandleHandlers.set('cache-get-infos', previousHandlers.getInfos);
    ipcHandleHandlers.set('cache-delete-file', previousHandlers.deleteFile);
    ipcHandleHandlers.set('cache-purge-files', previousHandlers.purgeFiles);

    fs.rmSync(isolatedUserData, { recursive: true, force: true });
  });

  it('caches a file with checksum in filename and removes source', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-src-${Date.now()}.img`);
    fs.writeFileSync(source, 'iso-content');

    const cachedPath = appCache.cacheFile(source, 'abc123');

    expect(cachedPath).toContain('===abc123');
    expect(fs.existsSync(cachedPath)).toBe(true);
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(cachedPath, 'utf8')).toBe('iso-content');
  });

  it('lists cached files', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-list-${Date.now()}.zip`);
    fs.writeFileSync(source, 'hello');
    appCache.cacheFile(source, 'deadbeef', 'release.zip');

    const files = appCache.getCachedFiles();

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      filename: 'release.zip',
      checksum: 'deadbeef',
      filesize: 5,
    });
  });

  it('returns zero filesize for empty cached file', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-empty-${Date.now()}.zip`);
    fs.writeFileSync(source, '');
    appCache.cacheFile(source, 'empty', 'empty.zip');

    expect(appCache.getCachedFiles()[0].filesize).toBe(0);
  });

  it('returns cached file infos by original filename', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-infos-${Date.now()}.bin`);
    fs.writeFileSync(source, 'data');
    appCache.cacheFile(source, 'checksum1', 'tool.bin');

    const infos = appCache.getCachedFileInfos('tool.bin');

    expect(infos).toMatchObject({
      filename: 'tool.bin',
      checksum: 'checksum1',
      filesize: 4,
    });
    expect(infos.filepath).toContain('tool===checksum1.bin');
  });

  it('returns the matching cached file when multiple files exist', () => {
    const sourceA = path.join(os.tmpdir(), `cleep-cache-a-${Date.now()}.img`);
    const sourceB = path.join(os.tmpdir(), `cleep-cache-b-${Date.now()}.img`);
    fs.writeFileSync(sourceA, 'aaa');
    fs.writeFileSync(sourceB, 'bbbb');
    appCache.cacheFile(sourceA, 'checksumA', 'first.img');
    appCache.cacheFile(sourceB, 'checksumB', 'second.img');

    const infos = appCache.getCachedFileInfos('second.img');
    expect(infos).toMatchObject({
      filename: 'second.img',
      checksum: 'checksumB',
      filesize: 4,
    });
    expect(infos.filepath).toContain('second===checksumB.img');
  });

  it('returns null when cached file does not exist', () => {
    expect(appCache.getCachedFileInfos('missing.zip')).toBeNull();
  });

  it('deletes a cached file', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-del-${Date.now()}.zip`);
    fs.writeFileSync(source, 'x');
    appCache.cacheFile(source, 'delme', 'to-delete.zip');

    expect(appCache.deleteCachedFile('to-delete.zip')).toBe(true);
    expect(appCache.getCachedFiles()).toHaveLength(0);
    expect(appCache.deleteCachedFile('to-delete.zip')).toBe(false);
  });

  it('purges all cached files', () => {
    const source1 = path.join(os.tmpdir(), `cleep-cache-p1-${Date.now()}.zip`);
    const source2 = path.join(os.tmpdir(), `cleep-cache-p2-${Date.now()}.zip`);
    fs.writeFileSync(source1, 'a');
    fs.writeFileSync(source2, 'b');
    appCache.cacheFile(source1, 'one', 'a.zip');
    appCache.cacheFile(source2, 'two', 'b.zip');

    appCache.purgeCachedFiles();

    expect(appCache.getCachedFiles()).toHaveLength(0);
  });

  it('throws when source file cannot be cached', () => {
    expect(() => appCache.cacheFile('/tmp/does-not-exist-cleep-cache.bin', 'x')).toThrow(
      'Unable to move file to cache folder',
    );
  });

  it('lists and purges malformed cache filenames', () => {
    fs.writeFileSync(path.join(cacheDir, 'not-a-cached-format'), 'bad');
    const files = appCache.getCachedFiles();
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('not-a-cached-format');
    appCache.purgeCachedFiles();
    expect(appCache.getCachedFiles()).toHaveLength(0);
  });

  it('skips broken symlinks when listing cached files', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn');
    fs.symlinkSync('/tmp/cleep-cache-missing-target-xyz', path.join(cacheDir, 'broken===link.bin'));

    expect(appCache.getCachedFiles()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith('Invalid file "broken===link.bin" in cache directory');
  });

  it('skips files that fail during purge', () => {
    const source = path.join(os.tmpdir(), `cleep-cache-purge-fail-${Date.now()}.zip`);
    fs.writeFileSync(source, 'z');
    appCache.cacheFile(source, 'fail', 'purge-fail.zip');

    const warnSpy = vi.spyOn(appLogger, 'warn');
    vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => appCache.purgeCachedFiles()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('Invalid file "purge-fail===fail.zip" in cache directory');
  });

  it('exposes cache ipc handlers', async () => {
    const source = path.join(os.tmpdir(), `cleep-cache-ipc-${Date.now()}.zip`);
    fs.writeFileSync(source, 'ipc');
    appCache.cacheFile(source, 'ipcsum', 'ipc.zip');

    await expect(ipcHandleHandlers.get('cache-get-infos')({})).resolves.toMatchObject({
      ok: true,
      data: {
        dir: cacheDir,
        files: [expect.objectContaining({ filename: 'ipc.zip', checksum: 'ipcsum' })],
      },
    });

    await expect(ipcHandleHandlers.get('cache-delete-file')({}, 'ipc.zip')).resolves.toEqual({
      ok: true,
      data: true,
    });
    await expect(ipcHandleHandlers.get('cache-delete-file')({}, 'missing.zip')).resolves.toEqual({
      ok: true,
      data: false,
    });

    const source2 = path.join(os.tmpdir(), `cleep-cache-ipc2-${Date.now()}.zip`);
    fs.writeFileSync(source2, 'ipc2');
    appCache.cacheFile(source2, 'p', 'purge-ipc.zip');
    await expect(ipcHandleHandlers.get('cache-purge-files')({})).resolves.toEqual({ ok: true, data: true });
    expect(appCache.getCachedFiles()).toHaveLength(0);
  });

  it('cache ipc handlers return error payloads when fs fails', async () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('readdir failed');
    });

    await expect(ipcHandleHandlers.get('cache-get-infos')({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'CACHE_LIST_FAILED' },
    });
    await expect(ipcHandleHandlers.get('cache-purge-files')({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'CACHE_PURGE_FAILED' },
    });
  });

  it('cache-delete-file ipc returns error when deletion throws', async () => {
    const source = path.join(os.tmpdir(), `cleep-cache-del-err-${Date.now()}.zip`);
    fs.writeFileSync(source, 'x');
    appCache.cacheFile(source, 'err', 'del-err.zip');

    vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('locked');
    });

    await expect(ipcHandleHandlers.get('cache-delete-file')({}, 'del-err.zip')).resolves.toMatchObject({
      ok: false,
      error: { code: 'CACHE_DELETE_FAILED' },
    });
  });
});
