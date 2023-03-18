/**
 * Copy/paste from https://github.com/sindresorhus/electron-dl that is not working due to ERR_UNSUPPORTED_ESM_URL_SCHEME after Electron>~3X.XX
 * The code has been typed for Typescript and useless dependencies has been removed (pupa, ext-name, unused-filename) to avoid future issues
 */
import {
  app,
  BrowserWindow,
  DownloadItem,
  SaveDialogOptions,
  Session,
  shell,
  WebContents,
  WebContentsView,
} from 'electron';
import path from 'path';
import fs from 'fs';
import mime from 'mime';

export class CancelError extends Error {}

export interface IDownloadFileProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
}

export interface IDownloadFileCompleted {
  filename: string;
  path: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export interface IDownloadFileOptions {
  dialogOptions: SaveDialogOptions;
  overwrite: boolean; // default false
  showProgressBar: boolean; // default true
  showBadge: boolean; // default true
  openFolderWhenDone: boolean; // default false
  errorMessage: string; // default 'The download of {filename} was interrupted'
  errorTitle: string; // default 'Download Error'
  filename: string; // default DownloadItem filename
  directory: string; // default user download directory
  saveAs: boolean; // default false,
  url: string; // mandatory
  window: BrowserWindow | WebContentsView;
  onCompleted: (completed: IDownloadFileCompleted) => void;
  onCancel: (item: DownloadItem) => void;
  onTotalProgress: (progress: IDownloadFileProgress) => void;
  onProgress: (progress: IDownloadFileProgress) => void;
  onStarted: (item: DownloadItem) => void;
}

function getFilenameFromMime(name: string, mimeType: string) {
  const extension = mime.getExtension(mimeType);
  return extension.length ? `${name}.${extension}` : name;
}

function unusedFilename(filepath: string): string {
  const extension = path.extname(filepath);
  const baseFilepath = extension.length ? filepath.replace(new RegExp(`${extension}$`), '') : filepath;
  let counter = 1;
  while (fs.existsSync(filepath)) {
    // pattern: /home/something/file (1).txt
    filepath = `${baseFilepath} (${counter})${extension}`;
    counter++;
  }
  return filepath;
}

function registerListener(
  session: Session,
  options: Partial<IDownloadFileOptions>,
  callback: (error: Error | null, item?: DownloadItem) => void,
) {
  const downloadItems = new Set<DownloadItem>();
  let receivedBytes = 0;
  let completedBytes = 0;
  let totalBytes = 0;
  const activeDownloadItems = () => downloadItems.size;
  const progressDownloadItems = () => receivedBytes / totalBytes;

  options = {
    showBadge: true,
    showProgressBar: true,
    ...options,
  };

  const listener = (_event: Event, item: DownloadItem, webContents: WebContents) => {
    downloadItems.add(item);
    totalBytes += item.getTotalBytes();

    const window_ = BrowserWindow.fromWebContents(webContents);
    if (!window_) {
      throw new Error('Failed to get window from web contents.');
    }

    if (options.directory && !path.isAbsolute(options.directory)) {
      throw new Error('The `directory` option must be an absolute path');
    }

    const directory = options.directory ?? app.getPath('downloads');

    let filePath;
    if (options.filename) {
      filePath = path.join(directory, options.filename);
    } else {
      const filename = item.getFilename();
      const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType());

      filePath = options.overwrite ? path.join(directory, name) : unusedFilename(path.join(directory, name));
    }

    const errorMessage = options.errorMessage ?? 'The download of {filename} was interrupted';

    if (options.saveAs) {
      item.setSaveDialogOptions({ defaultPath: filePath, ...options.dialogOptions });
    } else {
      item.setSavePath(filePath);
    }

    item.on('updated', () => {
      receivedBytes = completedBytes;
      for (const item of downloadItems) {
        receivedBytes += item.getReceivedBytes();
      }

      if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
        app.badgeCount = activeDownloadItems();
      }

      if (!window_.isDestroyed() && options.showProgressBar) {
        window_.setProgressBar(progressDownloadItems());
      }

      if (typeof options.onProgress === 'function') {
        const itemTransferredBytes = item.getReceivedBytes();
        const itemTotalBytes = item.getTotalBytes();

        options.onProgress({
          percent: itemTotalBytes ? itemTransferredBytes / itemTotalBytes : 0,
          transferredBytes: itemTransferredBytes,
          totalBytes: itemTotalBytes,
        });
      }

      if (typeof options.onTotalProgress === 'function') {
        options.onTotalProgress({
          percent: progressDownloadItems(),
          transferredBytes: receivedBytes,
          totalBytes,
        });
      }
    });

    item.on('done', (_event: Event, state) => {
      completedBytes += item.getTotalBytes();
      downloadItems.delete(item);

      if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
        app.badgeCount = activeDownloadItems();
      }

      if (!window_.isDestroyed() && !activeDownloadItems()) {
        window_.setProgressBar(-1);
        receivedBytes = 0;
        completedBytes = 0;
        totalBytes = 0;
      }

      session.removeListener('will-download', listener);

      if (state === 'cancelled') {
        if (typeof options.onCancel === 'function') {
          options.onCancel(item);
        }

        callback(new CancelError());
      } else if (state === 'interrupted') {
        const message = errorMessage.replace('{filename}', path.basename(filePath));
        callback(new Error(message));
      } else if (state === 'completed') {
        const savePath = item.getSavePath();

        if (process.platform === 'darwin') {
          app.dock.downloadFinished(savePath);
        }

        if (options.openFolderWhenDone) {
          shell.showItemInFolder(savePath);
        }

        if (typeof options.onCompleted === 'function') {
          options.onCompleted({
            filename: item.getFilename(),
            path: savePath,
            fileSize: item.getReceivedBytes(),
            mimeType: item.getMimeType(),
            url: item.getURL(),
          });
        }

        callback(null, item);
      }
    });

    if (typeof options.onStarted === 'function') {
      options.onStarted(item);
    }
  };

  session.on('will-download', listener);
}

export function electronDownload(
  window: BrowserWindow | WebContentsView,
  url: string,
  options: Partial<IDownloadFileOptions>,
) {
  return new Promise((resolve, reject) => {
    registerListener(window.webContents.session, options, (error: Error | null, item?: DownloadItem) => {
      if (error) {
        reject(error);
      } else {
        resolve(item);
      }
    });

    window.webContents.downloadURL(url);
  });
}
