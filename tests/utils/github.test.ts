import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGithubReleaseByTag, getLatestGithubRelease } from '../../src/utils/github';

vi.mock('axios');

describe('getLatestGithubRelease', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns latest release assets and tag', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [
        {
          tag_name: 'v1.2.3',
          assets: [
            {
              name: 'tool-linux.zip',
              browser_download_url: 'https://github.com/example/tool-linux.zip',
              size: 1234,
            },
          ],
        },
      ],
    });

    const release = await getLatestGithubRelease({ owner: 'CleepDevice', repo: 'cleep-os' });

    expect(release.tag).toBe('v1.2.3');
    expect(release.error).toBeUndefined();
    expect(release.assets).toHaveLength(1);
    expect(release.assets[0].name).toBe('tool-linux.zip');
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.github.com/repos/CleepDevice/cleep-os/releases?page=1&per_page=1',
      expect.objectContaining({
        headers: { accept: 'application/vnd.github+json' },
        timeout: 10000.0,
      }),
    );
  });

  it('returns a friendly error on rate limit', async () => {
    const rateLimitError = Object.assign(new Error('Forbidden'), { status: 403 });
    vi.mocked(axios.get).mockRejectedValue(rateLimitError);

    const release = await getLatestGithubRelease({ owner: 'CleepDevice', repo: 'cleep-os' });

    expect(release.assets).toEqual([]);
    expect(release.tag).toBe('');
    expect(release.error).toContain('Too many requests');
  });

  it('returns a generic error message otherwise', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('network down'));

    const release = await getLatestGithubRelease({ owner: 'CleepDevice', repo: 'cleep-os' });

    expect(release.error).toContain('network down');
  });
});

describe('getGithubReleaseByTag', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns release for a specific tag', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        tag_name: 'rpi-imager-v2.0.11',
        assets: [{ name: 'rpi-imager-linux-x64.zip', browser_download_url: 'https://x', size: 1 }],
      },
    });

    const release = await getGithubReleaseByTag(
      { owner: 'CleepDevice', repo: 'cleep-desktop' },
      'rpi-imager-v2.0.11',
    );

    expect(release.tag).toBe('rpi-imager-v2.0.11');
    expect(release.assets[0].name).toBe('rpi-imager-linux-x64.zip');
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.github.com/repos/CleepDevice/cleep-desktop/releases/tags/rpi-imager-v2.0.11',
      expect.objectContaining({
        headers: { accept: 'application/vnd.github+json' },
        timeout: 10000.0,
      }),
    );
  });
});
