import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChecksumFromUrl, getFilenameFromUrl } from '../../src/iso/utils';

vi.mock('axios');

describe('getFilenameFromUrl', () => {
  it('extracts filename from url path', () => {
    expect(getFilenameFromUrl('https://example.com/path/to/image.zip')).toBe('image.zip');
  });

  it('supports query strings', () => {
    expect(getFilenameFromUrl('https://example.com/downloads/raspios.img.xz?token=abc')).toBe('raspios.img.xz');
  });
});

describe('getChecksumFromUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns first token of checksum file when status is 200', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 200,
      data: 'abcdef123456  cleepos.zip\n',
    });

    await expect(getChecksumFromUrl('https://example.com/file.sha256')).resolves.toBe('abcdef123456');
  });

  it('returns null when status is not 200', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 404,
      data: 'not found',
    });

    await expect(getChecksumFromUrl('https://example.com/missing.sha256')).resolves.toBeNull();
  });
});
