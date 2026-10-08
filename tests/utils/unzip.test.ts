import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractZipArchive } from '../../src/utils/unzip';

vi.mock('unzipper', () => ({
  Open: {
    file: vi.fn(),
  },
}));

describe('extractZipArchive', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('opens the archive and extracts it to the destination', async () => {
    const { Open } = await import('unzipper');
    const extract = vi.fn(async () => undefined);
    vi.mocked(Open.file).mockResolvedValue({ extract, files: [] } as never);

    await extractZipArchive('/tmp/archive.zip', '/tmp/dest');

    expect(Open.file).toHaveBeenCalledWith('/tmp/archive.zip');
    expect(extract).toHaveBeenCalledWith({ path: '/tmp/dest' });
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

    const dest = path.join('/tmp', 'dest');
    await extractZipArchive('/tmp/archive.zip', dest);

    expect(chmodSpy).toHaveBeenCalledWith(path.join(dest, 'rpi-imager'), 0o755);
    expect(chmodSpy).not.toHaveBeenCalledWith(path.join(dest, 'readme.txt'), expect.anything());

    existsSpy.mockRestore();
    chmodSpy.mockRestore();
  });
});
