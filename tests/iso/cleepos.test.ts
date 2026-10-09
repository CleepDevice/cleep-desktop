import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CleepOs } from '../../src/iso/cleepos';
import * as github from '../../src/utils/github';
import * as isoUtils from '../../src/iso/utils';

vi.mock('../../src/utils/github');
vi.mock('../../src/iso/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof isoUtils>();
  return {
    ...actual,
    getChecksumFromUrl: vi.fn(),
  };
});

describe('CleepOs.getLatestRelease', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps github assets to iso release info', async () => {
    vi.mocked(github.getLatestGithubRelease).mockResolvedValue({
      tag: 'v1.0.0',
      assets: [
        {
          name: 'CleepOS_1.0.0.zip',
          browser_download_url: 'https://github.com/CleepDevice/cleep-os/releases/download/v1.0.0/CleepOS_1.0.0.zip',
          size: 42,
          updated_at: '2024-01-15T10:00:00Z',
        } as github.IGithubAsset,
        {
          name: 'CleepOS_1.0.0.zip.sha256',
          browser_download_url:
            'https://github.com/CleepDevice/cleep-os/releases/download/v1.0.0/CleepOS_1.0.0.zip.sha256',
          size: 64,
          updated_at: '2024-01-15T10:00:00Z',
        } as github.IGithubAsset,
      ],
    });
    vi.mocked(isoUtils.getChecksumFromUrl).mockResolvedValue('deadbeef');

    const release = await new CleepOs().getLatestRelease();

    expect(release.category).toBe('cleepos');
    expect(release.sha256).toBe('deadbeef');
    expect(release.size).toBe(42);
    expect(release.filename).toBe('CleepOS_1.0.0.zip');
    expect(release.label).toBe('Cleepos 1.0.0');
    expect(release.url).toContain('CleepOS_1.0.0.zip');
    expect(release.error).toBeUndefined();
  });

  it('forwards github errors', async () => {
    vi.mocked(github.getLatestGithubRelease).mockResolvedValue({
      tag: '',
      assets: [],
      error: 'Unable to request Github (network down)',
    });
    vi.mocked(isoUtils.getChecksumFromUrl).mockResolvedValue(null);

    const release = await new CleepOs().getLatestRelease();

    expect(release.error).toContain('Unable to request Github');
    expect(release.category).toBe('cleepos');
    expect(release.filename).toBe('');
    expect(release.url).toBeUndefined();
    expect(release.sha256).toBeNull();
  });
});
