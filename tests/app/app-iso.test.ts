import '../../src/app-logger';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as drivelist from 'drivelist';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotInstalledException } from '../../src/exceptions/not-installed.exception';
import { appSettings } from '../../src/app-settings';
import * as NodeWifi from 'node-wifi';
import { ipcHandleHandlers, ipcOnHandlers } from '../setup';
import type { InstallData } from '../../src/app-iso';

const sudoRun = vi.fn();
const sudoKill = vi.fn();
let lastSudoOptions: {
  terminatedCallback: (code: number) => void;
  stdoutCallback: (stdout: string) => void;
  stderrCallback: (stderr: string) => void;
} | null = null;

vi.mock('../../src/app-updater', () => ({
  appUpdater: {
    isFlashToolInstalled: vi.fn(() => true),
  },
}));

vi.mock('../../src/utils/github', () => ({
  getLatestGithubRelease: vi.fn(async () => ({
    tag: 'v1.0.0',
    assets: [
      {
        name: 'CleepOS_1.0.0.zip',
        browser_download_url: 'https://example.com/CleepOS_1.0.0.zip',
        size: 10,
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        name: 'CleepOS_1.0.0.zip.sha256',
        browser_download_url: 'https://example.com/CleepOS_1.0.0.zip.sha256',
        size: 64,
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
  })),
}));

vi.mock('../../src/iso/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/iso/utils')>();
  return {
    ...actual,
    getChecksumFromUrl: vi.fn(async () => 'abc123'),
  };
});

vi.mock('../../src/utils/download', () => ({
  downloadFile: vi.fn(async () => path.join(os.tmpdir(), 'downloaded-iso.bin')),
  cancelDownload: vi.fn(() => true),
}));

vi.mock('../../src/sudo/sudo', () => ({
  Sudo: class {
    constructor(options: typeof lastSudoOptions) {
      lastSudoOptions = options;
    }
    run = sudoRun;
    kill = sudoKill;
  },
}));

describe('AppIso', () => {
  let appIso: typeof import('../../src/app-iso').appIso;
  const send = vi.fn();
  const window = { webContents: { send } } as unknown as Electron.BrowserWindow;

  beforeAll(async () => {
    ({ appIso } = await import('../../src/app-iso'));
    appIso.configure(window);
  });

  beforeEach(() => {
    send.mockClear();
    sudoRun.mockClear();
    sudoKill.mockClear();
    lastSudoOptions = null;
  });

  it('refreshWifiNetworks populates networks', async () => {
    vi.mocked(NodeWifi.scan).mockImplementation((callback) => {
      callback(null, [
        {
          ssid: 'HomeWifi',
          bssid: 'aa',
          mac: 'aa:bb',
          channel: 1,
          frequency: 2412,
          signal_level: -40,
          quality: 80,
          security: 'WPA2',
          security_flags: [],
          mode: 'Unknown',
        },
      ]);
    });

    await appIso.refreshWifiNetworks();
    expect(appIso.getWifiNetworks()[0].ssid).toBe('HomeWifi');
  });

  it('getLatestRaspios returns undefined when disabled in settings', async () => {
    appSettings.set('cleep.isoraspios', false);
    await expect(appIso.getLatestRaspios()).resolves.toBeUndefined();
  });

  it('getLatestRaspios fetches releases when enabled', async () => {
    appSettings.set('cleep.isoraspios', true);
    const raspios = (appIso as unknown as { raspios: { getReleases: () => Promise<unknown> } }).raspios;
    vi.spyOn(raspios, 'getReleases').mockResolvedValue({
      full: { category: 'raspios', label: 'full' },
      lite: { category: 'raspios', label: 'lite' },
    });

    const releases = await appIso.getLatestRaspios();
    expect(releases).toMatchObject({
      full: expect.objectContaining({ category: 'raspios' }),
      lite: expect.objectContaining({ category: 'raspios' }),
    });
    appSettings.set('cleep.isoraspios', false);
  });

  it('getLatestCleepos caches release', async () => {
    const first = await appIso.getLatestCleepos();
    const second = await appIso.getLatestCleepos();
    expect(second).toBe(first);
    expect(first.category).toBe('cleepos');
  });

  it('getDriveList filters usb/card drives', async () => {
    vi.mocked(drivelist.list).mockResolvedValue([
      {
        device: '/dev/sda',
        description: 'System',
        size: 1000,
        isUSB: false,
        isCard: false,
        error: null,
      },
      {
        device: '/dev/sdb',
        description: 'USB Stick',
        size: 8000,
        isUSB: true,
        isCard: false,
        error: null,
      },
      {
        device: '/dev/sdc',
        description: 'Broken',
        size: 1000,
        isUSB: true,
        isCard: false,
        error: 'oops',
      },
      {
        device: '/dev/sdd',
        description: 'Empty',
        size: 0,
        isUSB: true,
        isCard: false,
        error: null,
      },
    ] as never);

    await expect(appIso.getDriveList()).resolves.toEqual([
      { device: '/dev/sdb', description: 'USB Stick', size: 8000 },
    ]);
  });

  it('getDriveList throws when flash tool is missing', async () => {
    const { appUpdater } = await import('../../src/app-updater');
    vi.mocked(appUpdater.isFlashToolInstalled).mockReturnValueOnce(false);

    await expect(appIso.getDriveList()).rejects.toBeInstanceOf(NotInstalledException);
  });

  it('startInstall uses local file path and flashes with sudo', async () => {
    const installData: InstallData = {
      isoUrl: 'file:///tmp/local.img',
      isoSha256: 'abc',
      isoFilename: 'local.img',
      drivePath: '/dev/sdb',
      wifiData: {
        network: 'Home',
        security: 'WPA2',
        password: 'secret',
        hidden: false,
      },
    };

    await appIso.startInstall(installData);

    expect(installData.isoPath).toBe('/tmp/local.img');
    expect(installData.wifiFilePath).toBeTruthy();
    expect(fs.existsSync(installData.wifiFilePath)).toBe(true);
    expect(sudoRun).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ step: 'privileges' }),
    );

    lastSudoOptions?.stderrCallback('Writing: [====] 55');
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ percent: 55, step: 'flashing' }),
    );

    lastSudoOptions?.stderrCallback('ignorable flash log line');
    expect(send).not.toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ error: 'ignorable flash log line' }),
    );

    lastSudoOptions?.stderrCallback('fatal flash error');
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ error: 'fatal flash error' }),
    );

    lastSudoOptions?.stdoutCallback('ok');
    lastSudoOptions?.terminatedCallback(1);
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({
        terminated: true,
        step: 'idle',
        error: 'fatal flash error',
      }),
    );
  });

  it('reports exit code when flash fails without stderr error', async () => {
    const installData: InstallData = {
      isoUrl: 'file:///tmp/local-exit.img',
      isoSha256: 'abc',
      isoFilename: 'local-exit.img',
      drivePath: '/dev/sdb',
      wifiData: null as unknown as InstallData['wifiData'],
    };

    await appIso.startInstall(installData);
    lastSudoOptions?.terminatedCallback(42);
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({
        terminated: true,
        error: 'Flash failed with exit code 42',
      }),
    );
  });

  it('reports success when flash exits cleanly', async () => {
    const installData: InstallData = {
      isoUrl: 'file:///tmp/local-ok.img',
      isoSha256: 'abc',
      isoFilename: 'local-ok.img',
      drivePath: '/dev/sdb',
      wifiData: null as unknown as InstallData['wifiData'],
    };

    await appIso.startInstall(installData);
    lastSudoOptions?.terminatedCallback(0);
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({
        terminated: true,
        step: 'idle',
        error: '',
      }),
    );
  });

  it('ignores concurrent startInstall while one is running', async () => {
    const installData: InstallData = {
      isoUrl: 'file:///tmp/local-concurrent.img',
      isoSha256: 'abc',
      isoFilename: 'local-concurrent.img',
      drivePath: '/dev/sdb',
      wifiData: null as unknown as InstallData['wifiData'],
    };
    await appIso.startInstall(installData);
    const callsAfterFirst = sudoRun.mock.calls.length;
    await appIso.startInstall(installData);
    expect(sudoRun.mock.calls.length).toBe(callsAfterFirst);
    lastSudoOptions?.terminatedCallback(0);
  });

  it('cancelInstall aborts sudo flash when running', async () => {
    const installData: InstallData = {
      isoUrl: 'file:///tmp/local2.img',
      isoSha256: 'abc',
      isoFilename: 'local2.img',
      drivePath: '/dev/sdb',
      wifiData: null as unknown as InstallData['wifiData'],
    };
    await appIso.startInstall(installData);
    appIso.cancelInstall();
    expect(sudoKill).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ step: 'canceled', terminated: true }),
    );
  });

  it('cancelInstall cancels download when isoUrl is active', async () => {
    const { cancelDownload } = await import('../../src/utils/download');
    (appIso as unknown as { currentInstall: { isoUrl: string } }).currentInstall.isoUrl =
      'https://example.com/iso.zip';
    appIso.cancelInstall();
    expect(cancelDownload).toHaveBeenCalledWith('https://example.com/iso.zip');
  });

  it('exposes iso ipc handlers', async () => {
    await expect(ipcHandleHandlers.get('iso-get-isos')({})).resolves.toMatchObject({
      data: expect.objectContaining({ cleepos: expect.any(Object) }),
    });
    await expect(ipcHandleHandlers.get('iso-refresh-wifi-networks')({})).resolves.toMatchObject({
      data: expect.any(Array),
      error: false,
    });
    expect(ipcHandleHandlers.get('iso-get-wifi-networks')({})).toMatchObject({
      data: expect.any(Array),
      error: false,
    });
    await expect(ipcHandleHandlers.get('iso-get-drives')({})).resolves.toMatchObject({
      flashToolInstalled: true,
    });
    await expect(ipcHandleHandlers.get('iso-has-wifi')({})).resolves.toMatchObject({
      data: expect.any(Boolean),
    });

    ipcOnHandlers.get('iso-start-install')({}, {
      isoUrl: 'file:///tmp/ipc.img',
      isoSha256: 'x',
      isoFilename: 'ipc.img',
      drivePath: '/dev/sdx',
      wifiData: null,
    });
    ipcOnHandlers.get('iso-cancel-install')({});
  });

  it('iso-get-drives reports missing flash tool', async () => {
    const { appUpdater } = await import('../../src/app-updater');
    vi.mocked(appUpdater.isFlashToolInstalled).mockReturnValueOnce(false);
    await expect(ipcHandleHandlers.get('iso-get-drives')({})).resolves.toEqual({
      data: [],
      error: true,
      flashToolInstalled: false,
    });
  });

  it('iso-has-wifi returns false when adapter scan fails', async () => {
    vi.mocked(NodeWifi.scan).mockImplementationOnce((callback) => {
      callback(new Error('no adapter'), []);
    });
    await expect(ipcHandleHandlers.get('iso-has-wifi')({})).resolves.toEqual({
      data: false,
      error: false,
    });
  });

  it('downloadIso reports progress and caches file', async () => {
    const source = path.join(os.tmpdir(), `iso-dl-${Date.now()}.img`);
    fs.writeFileSync(source, 'iso');
    const { downloadFile } = await import('../../src/utils/download');
    vi.mocked(downloadFile).mockResolvedValueOnce(source);

    const installData: InstallData = {
      isoUrl: 'https://example.com/os.img',
      isoSha256: 'checksum',
      isoFilename: 'os.img',
      drivePath: '/dev/sdb',
      wifiData: null as unknown as InstallData['wifiData'],
    };

    await (appIso as unknown as { downloadIso: (data: InstallData) => Promise<void> }).downloadIso(installData);
    expect(installData.isoPath).toContain('===checksum');
    expect(send).toHaveBeenCalledWith(
      'iso-install-progress',
      expect.objectContaining({ step: 'downloading' }),
    );
  });
});
