import fs from 'fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IGithubRelease } from '../../src/utils/github';

vi.mock('../../src/app-iso', () => ({
  FLASHTOOL_DIR: '/tmp/cleep-rpi-imager-test',
}));

vi.mock('../../src/app-logger', () => ({
  appLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/app-settings', () => ({
  appSettings: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../src/utils/download', () => ({
  downloadFile: vi.fn(),
}));

vi.mock('../../src/utils/github', () => ({
  getLatestGithubRelease: vi.fn(),
}));

vi.mock('../../src/utils/unzip', () => ({
  extractZipArchive: vi.fn(),
}));

describe('RpiImager', () => {
  let rpiImager: InstanceType<typeof import('../../src/flash-tool/rpi-imager').RpiImager>;
  let getLatestGithubRelease: ReturnType<typeof vi.fn>;
  let appSettings: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const mod = await import('../../src/flash-tool/rpi-imager');
    rpiImager = new mod.RpiImager();
    ({ getLatestGithubRelease } = await import('../../src/utils/github'));
    ({ appSettings } = await import('../../src/app-settings'));
  });

  it('returns initial flashing state for preparatory messages', () => {
    expect(rpiImager.parseFlashOutput('opening drive')).toEqual({
      mode: 'flashing',
      percent: 0,
      eta: -1,
    });
    expect(rpiImager.parseFlashOutput('opening image file')).toEqual({
      mode: 'flashing',
      percent: 0,
      eta: -1,
    });
    expect(rpiImager.parseFlashOutput('unmounting drive')).toEqual({
      mode: 'flashing',
      percent: 0,
      eta: -1,
    });
  });

  it('returns validating complete when both Writing and Verifying are present', () => {
    expect(rpiImager.parseFlashOutput('Writing done Verifying done')).toEqual({
      mode: 'validating',
      percent: 100,
      eta: -1,
    });
  });

  it('parses writing progress', () => {
    expect(rpiImager.parseFlashOutput('Writing: [====      ] 40')).toEqual({
      mode: 'flashing',
      percent: 40,
      eta: -1,
    });
  });

  it('parses verifying progress', () => {
    expect(rpiImager.parseFlashOutput('Verifying: [========  ] 80')).toEqual({
      mode: 'validating',
      percent: 80,
      eta: -1,
    });
  });

  it('returns undefined for unrelated output', () => {
    expect(rpiImager.parseFlashOutput('random log')).toBeUndefined();
  });

  it('maps github assets to platform releases', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v3.0.0',
      assets: [
        {
          name: 'flashtool-macos-arm64.zip',
          browser_download_url: 'https://example.com/macos.zip',
          size: 10,
        },
        {
          name: 'flashtool-linux-x64.zip',
          browser_download_url: 'https://example.com/linux.zip',
          size: 20,
        },
        {
          name: 'flashtool-windows-x64.zip',
          browser_download_url: 'https://example.com/windows.zip',
          size: 30,
        },
      ],
    } as IGithubRelease);

    const release = await rpiImager.getLatestRelease();
    expect(release.version).toBe('3.0.0');
    expect(release.darwin.filename).toBe('flashtool-macos-arm64.zip');
    expect(release.linux.size).toBe(20);
    expect(release.win32.size).toBe(30);
  });

  it('returns null installed version when binary missing', () => {
    vi.mocked(appSettings.get).mockReturnValue('2.0.0');
    expect(rpiImager.getInstalledVersion()).toBeNull();
  });

  it('returns installed version when binary exists', () => {
    fs.mkdirSync('/tmp/cleep-rpi-imager-test', { recursive: true });
    fs.writeFileSync('/tmp/cleep-rpi-imager-test/rpi-imager', 'bin');
    vi.mocked(appSettings.get).mockReturnValue('2.0.0');

    expect(rpiImager.getInstalledVersion()).toBe('2.0.0');
    fs.rmSync('/tmp/cleep-rpi-imager-test', { recursive: true, force: true });
  });

  it('checkForUpdates returns github error', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: '',
      assets: [],
      error: 'boom',
    });

    await expect(rpiImager.checkForUpdates()).resolves.toEqual({
      updateAvailable: false,
      error: 'boom',
    });
  });

  it('checkForUpdates installs when versions differ', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v5.0.0',
      assets: [
        {
          name: `flashtool-${process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'}-x64.zip`,
          browser_download_url: 'https://example.com/tool.zip',
          size: 1,
        },
      ],
    } as IGithubRelease);
    vi.mocked(appSettings.get).mockReturnValue('1.0.0');

    const { downloadFile } = await import('../../src/utils/download');
    vi.mocked(downloadFile).mockRejectedValue(new Error('offline'));
    rpiImager.setUpdateCallbacks(vi.fn(), vi.fn());

    await expect(rpiImager.checkForUpdates()).resolves.toEqual({ updateAvailable: true });
  });

  it('install succeeds for current platform', async () => {
    const { downloadFile } = await import('../../src/utils/download');
    const { extractZipArchive } = await import('../../src/utils/unzip');
    vi.mocked(downloadFile).mockResolvedValue('/tmp/rpi.zip');
    vi.mocked(extractZipArchive).mockResolvedValue(undefined);

    const updateCb = vi.fn();
    const progressCb = vi.fn();
    rpiImager.setUpdateCallbacks(updateCb, progressCb);

    await rpiImager.install({
      version: '7.0.0',
      darwin: { downloadUrl: 'https://example.com/d.zip', filename: 'd.zip', size: 1 },
      linux: { downloadUrl: 'https://example.com/l.zip', filename: 'l.zip', size: 1 },
      win32: { downloadUrl: 'https://example.com/w.zip', filename: 'w.zip', size: 1 },
    });

    expect(appSettings.set).toHaveBeenCalledWith('flashtool.version', '7.0.0');
    expect(progressCb).toHaveBeenCalledWith({ terminated: true, percent: 100 });
  });

  it('install returns false when platform missing', async () => {
    await expect(rpiImager.install({ version: '1.0.0' } as never)).resolves.toBe(false);
  });

  it('checkForUpdates reports no update when versions match and binary exists', async () => {
    fs.mkdirSync('/tmp/cleep-rpi-imager-test', { recursive: true });
    fs.writeFileSync('/tmp/cleep-rpi-imager-test/rpi-imager', 'bin');
    vi.mocked(appSettings.get).mockReturnValue('3.0.0');
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v3.0.0',
      assets: [],
    });

    await expect(rpiImager.checkForUpdates()).resolves.toEqual({ updateAvailable: false });
    fs.rmSync('/tmp/cleep-rpi-imager-test', { recursive: true, force: true });
  });
});
