import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelDownload, downloadFile, generateSha256 } from '../../src/utils/download';

vi.mock('axios');

describe('generateSha256', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const file of tmpFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    tmpFiles.length = 0;
  });

  it('computes sha256 of a file', async () => {
    const filepath = path.join(os.tmpdir(), `cleep-sha256-${Date.now()}.txt`);
    tmpFiles.push(filepath);
    fs.writeFileSync(filepath, 'hello cleep');

    const expected = crypto.createHash('sha256').update('hello cleep').digest('hex');
    await expect(generateSha256(filepath)).resolves.toBe(expected);
  });

  it('rejects when file does not exist', async () => {
    await expect(generateSha256('/tmp/does-not-exist-cleep-desktop.bin')).rejects.toBeTruthy();
  });
});

describe('downloadFile', () => {
  const downloaded: string[] = [];

  afterEach(() => {
    vi.resetAllMocks();
    for (const file of downloaded) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    downloaded.length = 0;
  });

  it('downloads a file and reports progress termination', async () => {
    const content = Buffer.from('downloaded-bytes');
    vi.mocked(axios).mockResolvedValue({
      data: Readable.from([content]),
      headers: { 'content-length': String(content.length) },
    });

    const onProgress = vi.fn();
    const filepath = await downloadFile('https://example.com/file.zip', onProgress);
    downloaded.push(filepath);

    expect(fs.readFileSync(filepath)).toEqual(content);
    expect(onProgress).toHaveBeenCalledWith({
      terminated: true,
      percent: 100,
      eta: 0,
    });
  });

  it('rejects when checksum does not match', async () => {
    const content = Buffer.from('bad-checksum');
    vi.mocked(axios).mockResolvedValue({
      data: Readable.from([content]),
      headers: { 'content-length': String(content.length) },
    });

    await expect(downloadFile('https://example.com/bad.zip', vi.fn(), '00'.repeat(32))).rejects.toThrow(
      'Invalid downloaded file checksum',
    );
  });

  it('accepts matching checksum', async () => {
    const content = Buffer.from('good-checksum');
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    vi.mocked(axios).mockResolvedValue({
      data: Readable.from([content]),
      headers: { 'content-length': String(content.length) },
    });

    const filepath = await downloadFile('https://example.com/good.zip', vi.fn(), sha256);
    downloaded.push(filepath);
    expect(fs.existsSync(filepath)).toBe(true);
  });

  it('can cancel a pending download url', async () => {
    vi.mocked(axios).mockImplementation(async (config: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        config.signal?.addEventListener('abort', () => reject(new Error('canceled')));
      });
    });

    const downloadPromise = downloadFile('https://example.com/slow.zip', vi.fn()).catch((error) => error);
    await Promise.resolve();
    expect(cancelDownload('https://example.com/slow.zip')).toBe(true);
    await expect(downloadPromise).resolves.toBeInstanceOf(Error);
  });
});

describe('cancelDownload', () => {
  it('returns false when no download is pending for url', () => {
    expect(cancelDownload('https://example.com/missing.zip')).toBe(false);
  });
});
