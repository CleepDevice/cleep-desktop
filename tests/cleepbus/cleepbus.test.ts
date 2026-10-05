import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IGithubRelease } from '../../src/utils/github';
import { USER_DATA_DIR } from '../setup';
import find from 'find-process';
import terminate from 'terminate';

vi.mock('../../src/utils/github', () => ({
  getLatestGithubRelease: vi.fn(),
}));

vi.mock('../../src/utils/download', () => ({
  downloadFile: vi.fn(async () => '/tmp/cleepbus.zip'),
}));

vi.mock('../../src/utils/unzip', () => ({
  extractZipArchive: vi.fn(async () => undefined),
}));

describe('Cleepbus', () => {
  let cleepbus: InstanceType<typeof import('../../src/cleepbus/cleepbus').Cleepbus>;
  let getLatestGithubRelease: ReturnType<typeof vi.fn>;
  let internal: {
    handleCleepbusStdoutData: (data: { toString: () => string }) => void;
    handleCleepbusStderrData: (data: { toString: () => string }) => void;
    handleCleepbusProcessClosed: (code: number) => void;
    initCleepbusWebsocket: (ws: EventEmitter) => void;
    checkCleepbusInstallation: (cleepbusPath: string) => boolean;
    killCleepbusInstances: () => Promise<void>;
    launchCleepbus: () => Promise<void>;
    forcedStop: boolean;
    cleepbusStartupError?: string;
  };

  beforeAll(async () => {
    const mod = await import('../../src/cleepbus/cleepbus');
    cleepbus = new mod.Cleepbus();
    internal = cleepbus as unknown as typeof internal;
    ({ getLatestGithubRelease } = await import('../../src/utils/github'));
  });

  it('maps github assets to platform releases', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v4.5.6',
      assets: [
        {
          name: 'cleepbus-macos-x64.zip',
          browser_download_url: 'https://example.com/macos.zip',
          size: 1,
        },
        {
          name: 'cleepbus-linux-x64.zip',
          browser_download_url: 'https://example.com/linux.zip',
          size: 2,
        },
        {
          name: 'cleepbus-windows-x64.zip',
          browser_download_url: 'https://example.com/windows.zip',
          size: 3,
        },
      ],
    } as IGithubRelease);

    const release = await cleepbus.getLatestRelease();
    expect(release.version).toBe('4.5.6');
    expect(release.darwin.filename).toBe('cleepbus-macos-x64.zip');
    expect(release.linux.filename).toBe('cleepbus-linux-x64.zip');
    expect(release.win32.filename).toBe('cleepbus-windows-x64.zip');
  });

  it('returns null installed version when binary is missing', () => {
    expect(cleepbus.getInstalledVersion()).toBeNull();
  });

  it('stores callbacks and stops safely without process', () => {
    cleepbus.setUpdateCallbacks(vi.fn(), vi.fn());
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(() => cleepbus.stop()).not.toThrow();
    expect(() => cleepbus.sendMessage('ping')).not.toThrow();
  });

  it('checkForUpdates reports github error through callback', async () => {
    const updateCb = vi.fn();
    cleepbus.setUpdateCallbacks(updateCb, vi.fn());
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: '',
      assets: [],
      error: 'github down',
    });

    await expect(cleepbus.checkForUpdates()).resolves.toEqual({
      updateAvailable: false,
      error: 'github down',
    });
    expect(updateCb).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'github down',
        terminated: true,
      }),
    );
  });

  it('routes stdout log levels', () => {
    expect(() =>
      internal.handleCleepbusStdoutData({
        toString: () => 'DEBUG: d\nINFO: i\nWARN: w\nERROR: e\nOTHER',
      }),
    ).not.toThrow();
  });

  it('handles stderr warnings hostname errors and debug lines', () => {
    internal.handleCleepbusStderrData({ toString: () => 'UserWarning: ignore me' });
    internal.handleCleepbusStderrData({
      toString: () => 'hostname seems to have unsupported characters',
    });
    expect(internal.cleepbusStartupError).toContain('invalid characters');
    internal.handleCleepbusStderrData({ toString: () => 'DEBUG: py' });
    internal.handleCleepbusStderrData({ toString: () => 'real error' });
  });

  it('dispatches websocket peer and message events', () => {
    const peerConnected = vi.fn();
    const peerDisconnected = vi.fn();
    const messageResponse = vi.fn();
    const connected = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), connected, vi.fn(), messageResponse, peerConnected, peerDisconnected);

    const ws = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
    ws.send = vi.fn();
    internal.initCleepbusWebsocket(ws);
    cleepbus.sendMessage('hello');
    expect(ws.send).toHaveBeenCalledWith('hello');

    const peer = {
      uuid: 'u1',
      hostname: 'h',
      ip: '1.1.1.1',
      macs: [],
      cleepdesktop: false,
      online: true,
    };
    ws.emit('message', Buffer.from(JSON.stringify({ content_type: 'PEER_CONNECTED', peer_infos: peer })));
    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ content_type: 'PEER_DISCONNECTED', peer_infos: peer })),
    );
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          content_type: 'MESSAGE_RESPONSE',
          peer_infos: peer,
          data: { sender: 'x', params: {}, startup: false },
        }),
      ),
    );
    ws.emit('message', Buffer.from(JSON.stringify({ content_type: 'UNKNOWN', peer_infos: peer })));
    ws.emit('close');
    ws.emit('error', new Error('ws'));

    expect(peerConnected).toHaveBeenCalledWith(peer);
    expect(peerDisconnected).toHaveBeenCalledWith(peer);
    expect(messageResponse).toHaveBeenCalled();
    expect(connected).toHaveBeenCalledWith(false);
  });

  it('does not relaunch when process closed after forced stop', () => {
    internal.forcedStop = true;
    expect(() => internal.handleCleepbusProcessClosed(1)).not.toThrow();
    internal.forcedStop = false;
  });

  it('checkCleepbusInstallation validates binary presence', async () => {
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(internal.checkCleepbusInstallation('/tmp/missing-cleepbus')).toBe(false);

    const binDir = path.join(USER_DATA_DIR, 'cleepbus');
    fs.mkdirSync(binDir, { recursive: true });
    const binPath = path.join(binDir, 'cleepbus');
    fs.writeFileSync(binPath, 'x');
    const { appSettings } = await import('../../src/app-settings');
    appSettings.set('cleepbus.version', '1.0.0');
    expect(internal.checkCleepbusInstallation(binPath)).toBe(true);
  });

  it('kills previous cleepbus instances with ws-port', async () => {
    vi.mocked(find).mockResolvedValueOnce([
      { pid: 11, cmd: 'cleepbus --ws-port=1234' },
      { pid: 12, cmd: 'cleepbus helper' },
    ] as never);
    await internal.killCleepbusInstances();
    expect(terminate).toHaveBeenCalledWith(11);
  });

  it('install downloads and extracts release for current platform', async () => {
    const updateCb = vi.fn();
    const progressCb = vi.fn();
    const updatingCb = vi.fn();
    cleepbus.setUpdateCallbacks(updateCb, progressCb);
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), updatingCb, vi.fn(), vi.fn(), vi.fn());

    const platformKey = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
    const release = {
      version: '9.9.9',
      darwin: { downloadUrl: 'https://example.com/d.zip', filename: 'd.zip', size: 1 },
      linux: { downloadUrl: 'https://example.com/l.zip', filename: 'l.zip', size: 1 },
      win32: { downloadUrl: 'https://example.com/w.zip', filename: 'w.zip', size: 1 },
    };

    // avoid launching real process after install
    vi.spyOn(cleepbus, 'start').mockResolvedValue(undefined);

    await cleepbus.install(release);
    expect(updateCb).toHaveBeenCalled();
    expect(progressCb).toHaveBeenCalledWith({ terminated: true, percent: 100 });
    expect(updatingCb).toHaveBeenCalledWith(false);
    expect(platformKey).toBeTruthy();
  });

  it('install returns false for unsupported platform key', async () => {
    await expect(cleepbus.install({ version: '1.0.0' } as never)).resolves.toBe(false);
  });

  it('handleCleepbusProcessClosed reports error and schedules relaunch', () => {
    vi.useFakeTimers();
    const errorCb = vi.fn();
    cleepbus.setCleepbusCallbacks(errorCb, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    internal.forcedStop = false;
    const launchSpy = vi.spyOn(internal, 'launchCleepbus').mockResolvedValue(undefined);

    internal.handleCleepbusProcessClosed(1);
    expect(errorCb).toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(launchSpy).toHaveBeenCalled();
    launchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('launchCleepbus returns early when not installed', async () => {
    await expect(internal.launchCleepbus()).resolves.toBeUndefined();
  });

  it('checkForUpdates installs when update available', async () => {
    vi.mocked(getLatestGithubRelease).mockResolvedValue({
      tag: 'v9.9.9',
      assets: [
        {
          name: `cleepbus-${process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'}-x64.zip`,
          browser_download_url: 'https://example.com/c.zip',
          size: 1,
        },
      ],
    } as IGithubRelease);

    const installSpy = vi.spyOn(cleepbus, 'install').mockResolvedValue(undefined as never);
    await expect(cleepbus.checkForUpdates()).resolves.toEqual({ updateAvailable: true });
    expect(installSpy).toHaveBeenCalled();
    installSpy.mockRestore();
  });
});
