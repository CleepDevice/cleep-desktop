import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ipcHandleHandlers, ipcOnHandlers, USER_DATA_DIR } from '../setup';

vi.mock('../../src/utils/github', () => ({
  getLatestGithubRelease: vi.fn(async () => ({
    tag: '',
    assets: [],
    error: 'no update in tests',
  })),
}));

describe('AppUpdater', () => {
  let appUpdater: typeof import('../../src/app-updater').appUpdater;
  const send = vi.fn();
  const window = { webContents: { send } } as unknown as Electron.BrowserWindow;
  const listeners = new Map<string, (...args: unknown[]) => void>();

  beforeAll(async () => {
    fs.writeFileSync(path.join(USER_DATA_DIR, 'changelog.txt'), '');
    vi.mocked(autoUpdater.addListener).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      listeners.set(event, cb);
      return autoUpdater as never;
    });
    ({ appUpdater } = await import('../../src/app-updater'));
  });

  it('exposes version and installed tool flags', () => {
    expect(appUpdater.getLatestVersion()).toBe('0.0.0-test');
    expect(typeof appUpdater.isFlashToolInstalled()).toBe('boolean');
    expect(typeof appUpdater.isCleepbusInstalled()).toBe('boolean');
  });

  it('configure schedules update check and quitAndInstall delegates', () => {
    vi.useFakeTimers();
    appUpdater.configure(window);
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    appUpdater.quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it('checkForUpdates returns status in manual mode', async () => {
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '0.0.0-test' },
    } as never);

    const status = await appUpdater.checkForUpdates('manual');
    expect(status).toMatchObject({
      cleepDesktop: { updateAvailable: false },
      flashTool: { updateAvailable: false, error: 'no update in tests' },
      cleepbus: { updateAvailable: false, error: 'no update in tests' },
    });
    expect(status.lastUpdateCheck).toBeTypeOf('number');
  });

  it('registers updater ipc handlers', async () => {
    const handler = ipcHandleHandlers.get('updater-check-for-updates');
    expect(handler).toBeTypeOf('function');
    const result = await handler({});
    expect(result).toMatchObject({ lastUpdateCheck: expect.any(Number) });

    const versions = ipcHandleHandlers.get('updater-get-software-versions')({});
    expect(versions).toMatchObject({
      cleepDesktop: expect.any(String),
    });

    ipcOnHandlers.get('updater-quit-and-install')({});
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it('forwards autoUpdater listener events to angular', () => {
    appUpdater.configure(window);
    send.mockClear();

    listeners.get('error')?.(new Error('upd fail'));
    expect(send).toHaveBeenCalledWith(
      'updater-cleepdesktop-download-progress',
      expect.objectContaining({ error: 'upd fail', terminated: true }),
    );

    listeners.get('update-available')?.({
      version: '9.0.0',
      releaseNotes: 'notes',
    });
    expect(send).toHaveBeenCalledWith(
      'updater-cleepdesktop-update-available',
      expect.objectContaining({ version: '9.0.0', changelog: 'notes' }),
    );

    listeners.get('download-progress')?.({ percent: 33 });
    expect(send).toHaveBeenCalledWith(
      'updater-cleepdesktop-download-progress',
      expect.objectContaining({ percent: 33 }),
    );

    listeners.get('update-downloaded')?.({
      version: '9.0.0',
      releaseNotes: [{ version: '9.0.0', note: 'n' }],
    });
    expect(send).toHaveBeenCalledWith(
      'updater-cleepdesktop-download-progress',
      expect.objectContaining({ installed: true, terminated: true }),
    );
  });

  it('forwards flash-tool and cleepbus update callbacks', () => {
    appUpdater.configure(window);
    send.mockClear();

    const internal = appUpdater as unknown as {
      onFlashToolUpdateAvailable: (data: unknown) => void;
      onFlashToolDownloadProgress: (data: unknown) => void;
      onCleepbusUpdateAvailable: (data: unknown) => void;
      onCleepbusDownloadProgress: (data: unknown) => void;
      getChangelog: (changelog?: string | Array<{ version: string; note: string }>) => string;
    };

    internal.onFlashToolUpdateAvailable({ version: '1', terminated: false });
    internal.onFlashToolDownloadProgress({ percent: 10, terminated: false });
    internal.onCleepbusUpdateAvailable({ version: '2', terminated: false });
    internal.onCleepbusDownloadProgress({ percent: 20, terminated: false });

    expect(send).toHaveBeenCalledWith('updater-flashtool-update-available', expect.any(Object));
    expect(send).toHaveBeenCalledWith('updater-flashtool-download-progress', expect.any(Object));
    expect(send).toHaveBeenCalledWith('updater-cleepbus-update-available', expect.any(Object));
    expect(send).toHaveBeenCalledWith('updater-cleepbus-download-progress', expect.any(Object));

    expect(internal.getChangelog()).toBe('');
    expect(internal.getChangelog('plain')).toBe('plain');
    expect(internal.getChangelog([{ version: '1.0', note: 'n' }])).toContain('1.0');
  });
});
