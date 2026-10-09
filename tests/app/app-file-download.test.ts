import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFileDownload } from '../../src/app-file-download';
import { ipcOnHandlers } from '../setup';

const electronDownload = vi.fn();

vi.mock('../../src/utils/electron-dl', () => ({
  CancelError: class CancelError extends Error {},
  electronDownload: (...args: unknown[]) => electronDownload(...args),
}));

describe('AppFileDownload', () => {
  const send = vi.fn();
  const window = { webContents: { send } } as unknown as Electron.BrowserWindow;

  beforeEach(() => {
    send.mockClear();
    electronDownload.mockReset();
  });

  it('configures window and cancels an active download via ipc', async () => {
    const downloader = new AppFileDownload();
    downloader.configure(window);

    const cancel = vi.fn();
    const getFilename = vi.fn(() => 'file.bin');
    let onStarted: ((item: { cancel: () => void; getFilename: () => string }) => void) | undefined;

    electronDownload.mockImplementation(async (_win, _url, options) => {
      onStarted = options.onStarted;
      onStarted?.({ cancel, getFilename });
      options.onProgress?.({ percent: 0.42, transferredBytes: 42, totalBytes: 100 });
      options.onCompleted?.({
        filename: 'file.bin',
        path: '/tmp/file.bin',
        fileSize: 100,
        mimeType: 'application/octet-stream',
        url: 'https://example.com/file.bin',
      });
    });

    const downloadHandler = ipcOnHandlers.get('download-file');
    await downloadHandler({}, { url: 'https://example.com/file.bin', title: 'Save' });

    expect(send).toHaveBeenCalledWith(
      'download-file-started',
      expect.objectContaining({ filename: 'file.bin', url: 'https://example.com/file.bin' }),
    );
    expect(send).toHaveBeenCalledWith(
      'download-file-status',
      expect.objectContaining({ status: 'downloading', percent: 42 }),
    );
    expect(send).toHaveBeenCalledWith(
      'download-file-status',
      expect.objectContaining({ status: 'success', percent: 100 }),
    );

    // start again and cancel before completion
    send.mockClear();
    let downloadId = '';
    electronDownload.mockImplementation(async (_win, _url, options) => {
      onStarted = options.onStarted;
      onStarted?.({ cancel, getFilename });
      const startedCall = send.mock.calls.find((call) => call[0] === 'download-file-started');
      downloadId = startedCall?.[1]?.downloadId;
      options.onCancel?.({ cancel, getFilename });
    });

    await downloadHandler({}, { url: 'https://example.com/file2.bin' });
    const cancelHandler = ipcOnHandlers.get('download-file-cancel');
    cancelHandler({}, downloadId);

    expect(send).toHaveBeenCalledWith(
      'download-file-status',
      expect.objectContaining({ status: 'canceled', percent: 0 }),
    );
  });

  it('emits failed status when download throws after start', async () => {
    const downloader = new AppFileDownload();
    downloader.configure(window);

    const getFilename = vi.fn(() => 'fail.bin');
    electronDownload.mockImplementation(async (_win, _url, options) => {
      options.onStarted?.({ cancel: vi.fn(), getFilename });
      throw new Error('network');
    });

    await ipcOnHandlers.get('download-file')({}, { url: 'https://example.com/fail.bin' });

    expect(send).toHaveBeenCalledWith(
      'download-file-status',
      expect.objectContaining({ status: 'failed', percent: 100, filename: 'fail.bin' }),
    );
  });
});
