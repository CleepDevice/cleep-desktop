import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractZipArchive } from '../../src/utils/unzip';

vi.mock('unzipper', () => ({
  Open: {
    file: vi.fn(),
  },
}));

describe('extractZipArchive', () => {
  const archivePath = path.join(os.tmpdir(), 'cleep-archive.zip');
  const destPath = path.join(os.tmpdir(), 'cleep-dest');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('opens the archive and extracts it to the destination', async () => {
    const { Open } = await import('unzipper');
    const extract = vi.fn(async () => undefined);
    vi.mocked(Open.file).mockResolvedValue({ extract, files: [] } as never);

    await extractZipArchive(archivePath, destPath);

    expect(Open.file).toHaveBeenCalledWith(archivePath);
    expect(extract).toHaveBeenCalledWith({ path: path.normalize(destPath) });
  });

  it('restores executable bits from zip metadata after extract', async () => {
    const { Open } = await import('unzipper');
    const extract = vi.fn(async () => undefined);
    vi.mocked(Open.file).mockResolvedValue({
      extract,
      files: [
        {
          type: 'File',
          path: 'rpi-imager',
          externalFileAttributes: 0x81ed0000, // 0755
        },
        {
          type: 'File',
          path: 'readme.txt',
          externalFileAttributes: 0x81a40000, // 0644
        },
      ],
    } as never);

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const chmodSpy = vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);

    await extractZipArchive(archivePath, destPath);

    expect(chmodSpy).toHaveBeenCalledWith(path.join(destPath, 'rpi-imager'), 0o755);
    expect(chmodSpy).not.toHaveBeenCalledWith(path.join(destPath, 'readme.txt'), expect.anything());

    existsSpy.mockRestore();
    chmodSpy.mockRestore();
  });

  it('rejects zip-slip entries before extracting', async () => {
    const { Open } = await import('unzipper');
    const extract = vi.fn(async () => undefined);
    vi.mocked(Open.file).mockResolvedValue({
      extract,
      files: [
        {
          type: 'File',
          path: '../evil.bin',
          externalFileAttributes: 0x81ed0000,
        },
      ],
    } as never);

    await expect(extractZipArchive(archivePath, destPath)).rejects.toThrow(/escapes/);
    expect(extract).not.toHaveBeenCalled();
  });
});
