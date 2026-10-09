import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IGithubRelease } from '../../src/utils/github';
import { RPI_IMAGER_VERSION } from '../../src/flash-tool/constants';
import { mockProcessPlatform } from '../helpers/mock-platform';

const { RPI_IMAGER_TEST_DIR } = vi.hoisted(() => {
  // require() — vi.hoisted runs before ESM imports are bound.
  const nodePath = require('path') as typeof path;
  const nodeOs = require('os') as typeof os;
  return {
    RPI_IMAGER_TEST_DIR: nodePath.join(nodeOs.tmpdir(), 'cleep-rpi-imager-test'),
  };
});

vi.mock('../../src/flash-tool/constants', async () => {
  const actual = await vi.importActual<typeof import('../../src/flash-tool/constants')>(
    '../../src/flash-tool/constants',
  );
  return {
    ...actual,
    RPI_IMAGER_DIR: RPI_IMAGER_TEST_DIR,
    RPI_IMAGER_VERSION: '2.0.11.1',
  };
});

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
  getGithubReleaseByTag: vi.fn(),
}));

vi.mock('../../src/utils/unzip', () => ({
  extractZipArchive: vi.fn(),
}));

function binaryNameForPlatform(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'rpi-imager.exe' : 'rpi-imager';
}

function writeFakeBinary(platform: NodeJS.Platform = process.platform): string {
  fs.mkdirSync(RPI_IMAGER_TEST_DIR, { recursive: true });
  const binPath = path.join(RPI_IMAGER_TEST_DIR, binaryNameForPlatform(platform));
  fs.writeFileSync(binPath, 'bin');
  return binPath;
}

function cleanupTestDir(): void {
  fs.rmSync(RPI_IMAGER_TEST_DIR, { recursive: true, force: true });
}

describe('RpiImager', () => {
  let rpiImager: InstanceType<typeof import('../../src/flash-tool/rpi-imager').RpiImager>;
  let getGithubReleaseByTag: ReturnType<typeof vi.fn>;
  let appSettings: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const mod = await import('../../src/flash-tool/rpi-imager');
    rpiImager = new mod.RpiImager();
    ({ getGithubReleaseByTag } = await import('../../src/utils/github'));
    ({ appSettings } = await import('../../src/app-settings'));
  });

  afterEach(() => {
    cleanupTestDir();
  });

  it('returns initial flashing state for preparatory messages', () => {
    expect(rpiImager.parseFlashOutput('opening drive')).toEqual({
      mode: 'flashing',
      percent: 0,
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

  it('maps pinned cleep-desktop assets to platform releases', async () => {
    vi.mocked(getGithubReleaseByTag).mockResolvedValue({
      tag: `rpi-imager-v${RPI_IMAGER_VERSION}`,
      assets: [
        {
          name: 'rpi-imager-macos.zip',
          browser_download_url: 'https://example.com/macos.zip',
          size: 10,
        },
        {
          name: 'rpi-imager-linux-x64.zip',
          browser_download_url: 'https://example.com/linux.zip',
          size: 20,
        },
        {
          name: 'rpi-imager-windows-x64.zip',
          browser_download_url: 'https://example.com/windows.zip',
          size: 30,
        },
      ],
    } as IGithubRelease);

    const release = await rpiImager.getPinnedRelease();
    expect(release.version).toBe(RPI_IMAGER_VERSION);
    expect(release.darwin.filename).toBe('rpi-imager-macos.zip');
    expect(release.linux.size).toBe(20);
    expect(release.win32.size).toBe(30);
    expect(getGithubReleaseByTag).toHaveBeenCalledWith(
      { owner: 'CleepDevice', repo: 'cleep-desktop' },
      `rpi-imager-v${RPI_IMAGER_VERSION}`,
    );
  });

  it('returns null installed version when binary missing', () => {
    cleanupTestDir();
    vi.mocked(appSettings.get).mockReturnValue('2.0.11');
    expect(rpiImager.getInstalledVersion()).toBeNull();
  });

  it('returns installed version when binary exists', () => {
    writeFakeBinary();
    vi.mocked(appSettings.get).mockReturnValue('2.0.11');

    expect(rpiImager.getInstalledVersion()).toBe('2.0.11');
  });

  it('resolves darwin binary path under rpi-imager dir', () => {
    const originalPlatform = process.platform;
    mockProcessPlatform('darwin');
    try {
      writeFakeBinary('darwin');
      vi.mocked(appSettings.get).mockReturnValue('2.0.11.1');
      expect(rpiImager.getInstalledVersion()).toBe('2.0.11.1');
    } finally {
      mockProcessPlatform(originalPlatform);
    }
  });

  it('checkForUpdates returns github error', async () => {
    vi.mocked(getGithubReleaseByTag).mockResolvedValue({
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
    vi.mocked(getGithubReleaseByTag).mockResolvedValue({
      tag: `rpi-imager-v${RPI_IMAGER_VERSION}`,
      assets: [
        {
          name: 'rpi-imager-linux-x64.zip',
          browser_download_url: 'https://example.com/tool.zip',
          size: 1,
        },
        {
          name: 'rpi-imager-macos.zip',
          browser_download_url: 'https://example.com/tool.zip',
          size: 1,
        },
        {
          name: 'rpi-imager-windows-x64.zip',
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
    vi.mocked(downloadFile).mockResolvedValue(path.join(os.tmpdir(), 'rpi.zip'));
    vi.mocked(extractZipArchive).mockImplementation(async (_source, destination) => {
      fs.mkdirSync(destination, { recursive: true });
      const binPath = path.join(destination, binaryNameForPlatform());
      fs.writeFileSync(binPath, 'bin');
      if (process.platform !== 'win32') {
        fs.chmodSync(binPath, 0o755);
      }
    });

    const updateCb = vi.fn();
    const progressCb = vi.fn();
    rpiImager.setUpdateCallbacks(updateCb, progressCb);

    await rpiImager.install({
      version: '2.0.11',
      darwin: { downloadUrl: 'https://example.com/d.zip', filename: 'd.zip', size: 1 },
      linux: { downloadUrl: 'https://example.com/l.zip', filename: 'l.zip', size: 1 },
      win32: { downloadUrl: 'https://example.com/w.zip', filename: 'w.zip', size: 1 },
    });

    expect(appSettings.set).toHaveBeenCalledWith('rpiimager.version', '2.0.11');
    expect(progressCb).toHaveBeenCalledWith({ terminated: true, percent: 100 });
  });

  it('install downloads darwin asset when platform is darwin', async () => {
    const originalPlatform = process.platform;
    mockProcessPlatform('darwin');
    try {
      const { downloadFile } = await import('../../src/utils/download');
      const { extractZipArchive } = await import('../../src/utils/unzip');
      vi.mocked(downloadFile).mockResolvedValue(path.join(os.tmpdir(), 'rpi-darwin.zip'));
      vi.mocked(extractZipArchive).mockImplementation(async (_source, destination) => {
        fs.mkdirSync(destination, { recursive: true });
        const binPath = path.join(destination, 'rpi-imager');
        fs.writeFileSync(binPath, 'bin');
        fs.chmodSync(binPath, 0o755);
      });

      await rpiImager.install({
        version: '2.0.11.1',
        darwin: { downloadUrl: 'https://example.com/macos-only.zip', filename: 'macos.zip', size: 9 },
        linux: { downloadUrl: 'https://example.com/l.zip', filename: 'l.zip', size: 1 },
        win32: { downloadUrl: 'https://example.com/w.zip', filename: 'w.zip', size: 1 },
      });

      expect(downloadFile).toHaveBeenCalledWith(
        'https://example.com/macos-only.zip',
        expect.any(Function),
      );
      expect(appSettings.set).toHaveBeenCalledWith('rpiimager.version', '2.0.11.1');
    } finally {
      mockProcessPlatform(originalPlatform);
    }
  });

  it('install returns false when platform missing', async () => {
    await expect(rpiImager.install({ version: '1.0.0' } as never)).resolves.toBe(false);
  });

  it('checkForUpdates reports no update when versions match and binary exists', async () => {
    writeFakeBinary();
    vi.mocked(appSettings.get).mockReturnValue(RPI_IMAGER_VERSION);
    vi.mocked(getGithubReleaseByTag).mockResolvedValue({
      tag: `rpi-imager-v${RPI_IMAGER_VERSION}`,
      assets: [
        { name: 'rpi-imager-linux-x64.zip', browser_download_url: 'https://x', size: 1 },
        { name: 'rpi-imager-macos.zip', browser_download_url: 'https://x', size: 1 },
        { name: 'rpi-imager-windows-x64.zip', browser_download_url: 'https://x', size: 1 },
      ],
    } as IGithubRelease);

    await expect(rpiImager.checkForUpdates()).resolves.toEqual({ updateAvailable: false });
  });
});
