import fs from 'fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IGithubRelease } from '../../src/utils/github';

vi.mock('../../src/app-iso', () => ({
  FLASHTOOL_DIR: '/tmp/cleep-flash-tool-test',
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

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    exec: vi.fn(),
  };
});

describe('Balena', () => {
  let Balena: typeof import('../../src/flash-tool/balena').Balena;
  let balena: InstanceType<typeof import('../../src/flash-tool/balena').Balena>;
  let getLatestGithubRelease: ReturnType<typeof vi.fn>;
  let appSettings: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    ({ Balena } = await import('../../src/flash-tool/balena'));
    balena = new Balena();
    ({ getLatestGithubRelease } = await import('../../src/utils/github'));
    ({ appSettings } = await import('../../src/app-settings'));
  });

  it('parses flashing progress line', () => {
    const line = 'Flashing [=====>                  ] 42% eta 1m05s';
    expect(balena.parseFlashOutput(line)).toEqual({
      mode: 'flashing',
      percent: 42,
      eta: 65,
    });
  });

  it('parses validating progress line', () => {
    const line = 'Validating [====================] 100% eta 0s';
    expect(balena.parseFlashOutput(line)).toEqual({
      mode: 'validating',
      percent: 100,
      eta: 0,
    });
  });

  it('parses eta with hours minutes and seconds', () => {
    const line = 'Flashing [=>                    ] 10% eta 1h2m3s';
    expect(balena.parseFlashOutput(line)).toEqual({
      mode: 'flashing',
      percent: 10,
      eta: 3723,
    });
  });

  it('returns undefined for unrelated output', () => {
    expect(balena.parseFlashOutput('Starting...')).toBeUndefined();
    expect(balena.parseFlashOutput('')).toBeUndefined();
  });

  it('maps github assets to platform releases', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v2.1.0',
      assets: [
        {
          name: 'flashtool-darwin-x64.zip',
          browser_download_url: 'https://example.com/darwin.zip',
          size: 11,
        },
        {
          name: 'flashtool-linux-x64.zip',
          browser_download_url: 'https://example.com/linux.zip',
          size: 22,
        },
        {
          name: 'flashtool-windows-x64.zip',
          browser_download_url: 'https://example.com/windows.zip',
          size: 33,
        },
      ],
    } as IGithubRelease);

    const release = await balena.getLatestRelease();

    expect(release.version).toBe('2.1.0');
    expect(release.darwin).toMatchObject({
      downloadUrl: 'https://example.com/darwin.zip',
      filename: 'flashtool-darwin-x64.zip',
      size: 11,
    });
    expect(release.linux.filename).toBe('flashtool-linux-x64.zip');
    expect(release.win32.filename).toBe('flashtool-windows-x64.zip');
  });

  it('returns null installed version when binary is missing', () => {
    vi.mocked(appSettings.get).mockReturnValue('1.0.0');
    expect(balena.getInstalledVersion()).toBeNull();
  });

  it('returns installed version when binary exists', () => {
    fs.mkdirSync('/tmp/cleep-flash-tool-test', { recursive: true });
    fs.writeFileSync('/tmp/cleep-flash-tool-test/balena', 'bin');
    vi.mocked(appSettings.get).mockReturnValue('1.0.0');

    expect(balena.getInstalledVersion()).toBe('1.0.0');

    fs.rmSync('/tmp/cleep-flash-tool-test', { recursive: true, force: true });
  });

  it('checkForUpdates returns error from github', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: '',
      assets: [],
      error: 'rate limited',
    });

    await expect(balena.checkForUpdates()).resolves.toEqual({
      updateAvailable: false,
      error: 'rate limited',
    });
  });

  it('checkForUpdates installs when versions differ', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v9.0.0',
      assets: [
        {
          name: `flashtool-${process.platform === 'win32' ? 'windows' : process.platform}-x64.zip`,
          browser_download_url: 'https://example.com/tool.zip',
          size: 1,
        },
      ],
    } as IGithubRelease);
    vi.mocked(appSettings.get).mockReturnValue('1.0.0');

    const updateCb = vi.fn();
    const progressCb = vi.fn();
    balena.setUpdateCallbacks(updateCb, progressCb);

    const { downloadFile } = await import('../../src/utils/download');
    vi.mocked(downloadFile).mockRejectedValue(new Error('offline'));

    await expect(balena.checkForUpdates()).resolves.toEqual({ updateAvailable: true });
  });

  it('install succeeds and extracts archive', async () => {
    const { downloadFile } = await import('../../src/utils/download');
    const { extractZipArchive } = await import('../../src/utils/unzip');
    vi.mocked(downloadFile).mockResolvedValue('/tmp/flashtool.zip');
    vi.mocked(extractZipArchive).mockResolvedValue(undefined);

    const updateCb = vi.fn();
    const progressCb = vi.fn();
    balena.setUpdateCallbacks(updateCb, progressCb);

    const platformKey = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
    await balena.install({
      version: '8.0.0',
      darwin: { downloadUrl: 'https://example.com/d.zip', filename: 'd.zip', size: 1 },
      linux: { downloadUrl: 'https://example.com/l.zip', filename: 'l.zip', size: 1 },
      win32: { downloadUrl: 'https://example.com/w.zip', filename: 'w.zip', size: 1 },
    });

    expect(updateCb).toHaveBeenCalled();
    expect(progressCb).toHaveBeenCalledWith({ terminated: true, percent: 100 });
    expect(appSettings.set).toHaveBeenCalledWith('flashtool.version', '8.0.0');
    expect(platformKey).toBeTruthy();
  });

  it('install returns false when platform missing', async () => {
    await expect(balena.install({ version: '1.0.0' } as never)).resolves.toBe(false);
  });

  it('getDriveList parses balena output', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation(((
      _cmd: string,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, '/dev/sdb  15.6 GB  Generic USB\n', '');
      return { pid: 1 } as never;
    }) as typeof exec);

    await expect(balena.getDriveList()).resolves.toEqual([
      { device: '/dev/sdb', size: 15600000000, description: 'Generic USB' },
    ]);
  });

  it('getDriveList rejects on exec error', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation(((
      _cmd: string,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error('exec failed'), '', '');
      return { pid: 1 } as never;
    }) as typeof exec);

    await expect(balena.getDriveList()).rejects.toThrow('exec failed');
  });

  it('computeSizeInBytes and getDrivePattern via internal access', () => {
    const internal = balena as unknown as {
      computeSizeInBytes: (size: string, unit: string) => number;
      getDrivePattern: () => RegExp;
      parseEta: (eta: string) => number;
    };
    expect(internal.computeSizeInBytes('1.5', 'GB')).toBe(1500000000);
    expect(internal.parseEta('')).toBe(0);
    expect(internal.parseEta('2m')).toBe(120);
    expect(() => internal.computeSizeInBytes('1', 'XB')).toThrow('not supported');
    expect(internal.getDrivePattern()).toBeInstanceOf(RegExp);
  });
});
