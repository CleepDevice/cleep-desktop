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
  });

  it('opens the archive and extracts it to the destination', async () => {
    const { Open } = await import('unzipper');
    const extract = vi.fn(async () => undefined);
    vi.mocked(Open.file).mockResolvedValue({ extract } as never);

    await extractZipArchive('/tmp/archive.zip', '/tmp/dest');

    expect(Open.file).toHaveBeenCalledWith('/tmp/archive.zip');
    expect(extract).toHaveBeenCalledWith({ path: '/tmp/dest' });
  });
});
