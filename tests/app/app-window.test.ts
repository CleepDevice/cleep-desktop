import { BrowserWindow, dialog } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { createAppWindow, createSplashscreenWindow } from '../../src/app-window';
import { appContext } from '../../src/app-context';

describe('app-window', () => {
  it('creates main application window and handles lifecycle events', () => {
    vi.useFakeTimers();
    const splash = { close: vi.fn() } as unknown as BrowserWindow;
    const window = createAppWindow(splash);

    expect(BrowserWindow).toHaveBeenCalled();
    const windowOptions = vi.mocked(BrowserWindow).mock.calls[0][0];
    expect(windowOptions?.webPreferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    });
    expect(windowOptions?.webPreferences?.preload).toMatch(/preload\.js$/);
    expect(window.loadURL).toHaveBeenCalled();
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalled();

    const readyHandler = vi.mocked(window.once).mock.calls.find((call) => call[0] === 'ready-to-show')?.[1] as
      | (() => void)
      | undefined;
    readyHandler?.();
    vi.advanceTimersByTime(1600);
    expect(splash.close).toHaveBeenCalled();
    expect(window.maximize).toHaveBeenCalled();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();

    const openHandler = vi.mocked(window.webContents.setWindowOpenHandler).mock.calls[0][0];
    expect(openHandler({ url: 'https://example.com' } as Electron.HandlerDetails)).toEqual({ action: 'deny' });

    appContext.allowAppClosing = false;
    const closeHandler = vi.mocked(window.on).mock.calls.find((call) => call[0] === 'close')?.[1] as
      | ((e: { preventDefault: () => void }) => void)
      | undefined;
    const preventDefault = vi.fn();
    vi.mocked(dialog.showMessageBoxSync).mockReturnValueOnce(1);
    closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();

    vi.mocked(dialog.showMessageBoxSync).mockReturnValueOnce(0);
    closeHandler?.({ preventDefault });
    appContext.allowAppClosing = true;
    vi.useRealTimers();
  });

  it('creates splashscreen window and shows it after load', () => {
    const main = { show: vi.fn() } as unknown as BrowserWindow;
    const splash = createSplashscreenWindow(main);

    expect(BrowserWindow).toHaveBeenCalled();
    expect(splash.loadURL).toHaveBeenCalled();

    const finishHandler = vi
      .mocked(splash.webContents.on)
      .mock.calls.find((call) => call[0] === 'did-finish-load')?.[1] as (() => void) | undefined;
    finishHandler?.();
    expect(splash.show).toHaveBeenCalled();
  });
});
