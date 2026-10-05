import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RaspiOs } from '../../src/iso/raspios';
import * as isoUtils from '../../src/iso/utils';

vi.mock('axios');
vi.mock('../../src/iso/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof isoUtils>();
  return {
    ...actual,
    getChecksumFromUrl: vi.fn(),
  };
});

describe('RaspiOs.getReleases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses latest full and lite releases from directory listings', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url.includes('raspios_full_armhf/images') && !url.includes('raspios_full_armhf-')) {
        return {
          data: `
            <a href="raspios_full_armhf-2024-01-01/">old</a>
            <a href="raspios_full_armhf-2024-06-01/">new</a>
          `,
        };
      }
      if (url.includes('raspios_lite_armhf/images') && !url.includes('raspios_lite_armhf-')) {
        return {
          data: `
            <a href="raspios_lite_armhf-2024-02-01/">old</a>
            <a href="raspios_lite_armhf-2024-07-01/">new</a>
          `,
        };
      }
      if (url.includes('raspios_full_armhf-2024-06-01')) {
        return {
          data: `
            <a href="2024-05-13-raspios-bookworm-armhf-full.img.xz">img</a>
            <a href="2024-05-13-raspios-bookworm-armhf-full.img.xz.sha256">sha</a>
          `,
        };
      }
      if (url.includes('raspios_lite_armhf-2024-07-01')) {
        return {
          data: `
            <a href="2024-05-13-raspios-bookworm-armhf-lite.img.xz">img</a>
            <a href="2024-05-13-raspios-bookworm-armhf-lite.img.xz.sha256">sha</a>
          `,
        };
      }
      throw new Error(`Unexpected url ${url}`);
    });

    vi.mocked(isoUtils.getChecksumFromUrl).mockResolvedValue('abc123');

    const releases = await new RaspiOs().getReleases();

    expect(releases.error).toBeUndefined();
    expect(releases.full.label).toBe('Raspberry Pi OS with desktop');
    expect(releases.lite.label).toBe('Raspberry Pi OS Lite');
    expect(releases.full.filename).toBe('2024-05-13-raspios-bookworm-armhf-full.img.xz');
    expect(releases.lite.filename).toBe('2024-05-13-raspios-bookworm-armhf-lite.img.xz');
    expect(releases.full.sha256).toBe('abc123');
    expect(releases.lite.sha256).toBe('abc123');
    expect(releases.full.category).toBe('raspios');
  });

  it('returns error payload when listing fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));

    const releases = await new RaspiOs().getReleases();

    expect(releases.full).toBeUndefined();
    expect(releases.lite).toBeUndefined();
    expect(releases.error).toBe('offline');
  });
});
