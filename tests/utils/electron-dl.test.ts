import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelError, electronDownload } from '../../src/utils/electron-dl';
import { mockProcessPlatform } from '../helpers/mock-platform';
import { USER_DATA_DIR } from '../setup';

function createDownloadItem(overrides: Partial<Record<string, unknown>> = {}) {
  const item = new EventEmitter() as EventEmitter & {
    getTotalBytes: () => number;
    getReceivedBytes: () => number;
    getFilename: () => string;
    getMimeType: () => string;
    getURL: () => string;
    getSavePath: () => string;
    setSavePath: ReturnType<typeof vi.fn>;
    setSaveDialogOptions: ReturnType<typeof vi.fn>;
  };
  item.getTotalBytes = vi.fn(() => 100);
  item.getReceivedBytes = vi.fn(() => 40);
  item.getFilename = vi.fn(() => 'archive.zip');
  item.getMimeType = vi.fn(() => 'application/zip');
  item.getURL = vi.fn(() => 'https://example.com/archive.zip');
  item.getSavePath = vi.fn(() => path.join(USER_DATA_DIR, 'downloads', 'archive.zip'));
  item.setSavePath = vi.fn();
  item.setSaveDialogOptions = vi.fn();
  Object.assign(item, overrides);
  return item;
}

describe('electronDownload', () => {
  const downloadsDir = path.join(USER_DATA_DIR, 'downloads');

  afterEach(() => {
    vi.clearAllMocks();
    mockProcessPlatform('linux');
    if (fs.existsSync(downloadsDir)) {
      for (const file of fs.readdirSync(downloadsDir)) {
        fs.rmSync(path.join(downloadsDir, file), { force: true });
      }
    }
  });

  it('downloads a file and reports progress/completion', async () => {
    fs.mkdirSync(downloadsDir, { recursive: true });
    const window = new BrowserWindow() as unknown as BrowserWindow;
    const progressWindow = {
      isDestroyed: vi.fn(() => false),
      setProgressBar: vi.fn(),
    };
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(progressWindow as never);

    const item = createDownloadItem();
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const onStarted = vi.fn();
    const onProgress = vi.fn();
    const onTotalProgress = vi.fn();
    const onCompleted = vi.fn();

    const promise = electronDownload(window, 'https://example.com/archive.zip', {
      onStarted,
      onProgress,
      onTotalProgress,
      onCompleted,
      openFolderWhenDone: true,
    });

    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('updated');
    item.emit('done', new Event('done'), 'completed');

    await expect(promise).resolves.toBe(item);
    expect(onStarted).toHaveBeenCalledWith(item);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 0.4, transferredBytes: 40, totalBytes: 100 }),
    );
    expect(onCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'archive.zip',
        mimeType: 'application/zip',
      }),
    );
    expect(shell.showItemInFolder).toHaveBeenCalled();
    expect(progressWindow.setProgressBar).toHaveBeenCalled();
  });

  it('notifies macOS dock when download completes on darwin', async () => {
    mockProcessPlatform('darwin');
    fs.mkdirSync(downloadsDir, { recursive: true });
    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);

    const savePath = path.join(downloadsDir, 'archive.zip');
    const item = createDownloadItem({
      getSavePath: () => savePath,
    });
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const promise = electronDownload(window, 'https://example.com/archive.zip');
    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('done', new Event('done'), 'completed');

    await expect(promise).resolves.toBe(item);
    expect(app.dock.downloadFinished).toHaveBeenCalledWith(savePath);
  });

  it('rejects with CancelError when download is cancelled', async () => {
    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);
    const item = createDownloadItem();
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const onCancel = vi.fn();
    const promise = electronDownload(window, 'https://example.com/archive.zip', { onCancel });
    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('done', new Event('done'), 'cancelled');

    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(onCancel).toHaveBeenCalledWith(item);
  });

  it('rejects when download is interrupted', async () => {
    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);
    const item = createDownloadItem();
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const promise = electronDownload(window, 'https://example.com/archive.zip', {
      errorMessage: 'Failed {filename}',
    });
    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('done', new Event('done'), 'interrupted');

    await expect(promise).rejects.toThrow('Failed archive.zip');
  });

  it('uses saveAs dialog options when requested', async () => {
    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);
    const item = createDownloadItem({ getFilename: () => 'noext' });
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const promise = electronDownload(window, 'https://example.com/file', {
      saveAs: true,
      dialogOptions: { title: 'Save file' },
      filename: 'forced.bin',
    });
    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('done', new Event('done'), 'completed');
    await promise;

    expect(item.setSaveDialogOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save file' }),
    );
  });

  it('generates unused filenames when target already exists', async () => {
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(path.join(downloadsDir, 'archive.zip'), 'x');

    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);
    const item = createDownloadItem();
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const promise = electronDownload(window, 'https://example.com/archive.zip', { overwrite: false });
    willDownload?.(new Event('will-download'), item, window.webContents);
    item.emit('done', new Event('done'), 'completed');
    await promise;

    expect(item.setSavePath).toHaveBeenCalledWith(expect.stringContaining('archive (1).zip'));
  });

  it('throws when directory is not absolute', async () => {
    const window = new BrowserWindow() as unknown as BrowserWindow;
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
    } as never);
    const item = createDownloadItem();
    let willDownload: ((event: Event, item: unknown, webContents: unknown) => void) | undefined;
    (window.webContents.session.on as ReturnType<typeof vi.fn>).mockImplementation(
      (event: string, listener: typeof willDownload) => {
        if (event === 'will-download') {
          willDownload = listener;
        }
      },
    );

    const promise = electronDownload(window, 'https://example.com/archive.zip', {
      directory: 'relative-dir',
    });
    expect(() => willDownload?.(new Event('will-download'), item, window.webContents)).toThrow(
      'absolute path',
    );
    promise.catch(() => undefined);
  });

  it('exposes CancelError', () => {
    expect(new CancelError()).toBeInstanceOf(Error);
  });
});
