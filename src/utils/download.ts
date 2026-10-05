import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import { Transform } from 'stream';
import { appLogger } from '../app-logger';
import crypto from 'crypto';

export interface IDownloadProgress {
  percent: number;
  terminated: boolean;
  eta?: number;
  error?: string;
}

export type OnDownloadProgressCallback = (downloadProgress: IDownloadProgress) => void;

const abordDownloads: Record<string, AbortController> = {};
const PROGRESS_INTERVAL_MS = 1000;

function createDownloadProgressStream(
  totalSize: number,
  onProgress: (percent: number, eta: number) => void,
): Transform {
  let transferred = 0;
  const startedAt = Date.now();
  let lastEmitAt = 0;

  const emitProgress = (): void => {
    const now = Date.now();
    if (now - lastEmitAt < PROGRESS_INTERVAL_MS) {
      return;
    }
    lastEmitAt = now;

    const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001);
    const percent = totalSize > 0 ? Math.min(100, Math.round((transferred / totalSize) * 100)) : 0;
    const bytesPerSecond = transferred / elapsedSeconds;
    const remainingBytes = Math.max(totalSize - transferred, 0);
    const eta = bytesPerSecond > 0 ? Math.round(remainingBytes / bytesPerSecond) : 0;
    onProgress(percent, eta);
  };

  return new Transform({
    transform(chunk, _encoding, callback) {
      transferred += chunk.length;
      emitProgress();
      callback(null, chunk);
    },
  });
}

export async function downloadFile(
  url: string,
  downloadProgressCallback: OnDownloadProgressCallback,
  sha256?: string,
): Promise<string> {
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0' };
  const tmpFilename = path.join(app.getPath('temp'), uuidv4() + '.zip');
  appLogger.debug(`Download file to ${tmpFilename}`);
  const writer = fs.createWriteStream(tmpFilename);

  abordDownloads[url] = new AbortController();

  appLogger.debug(`Download file from ${url}`);
  const download = await axios({
    url,
    method: 'GET',
    headers,
    responseType: 'stream',
    signal: abordDownloads[url].signal,
  });
  const totalSize = Number(download.headers['content-length']) || 0;
  appLogger.debug(`File to download size ${totalSize}`);
  const progress = createDownloadProgressStream(totalSize, (percent, eta) => {
    downloadProgressCallback({
      terminated: false,
      percent,
      eta,
    });
  });
  download.data.pipe(progress).pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', async () => {
      appLogger.debug('Download file completed');
      downloadProgressCallback({
        terminated: true,
        percent: 100,
        eta: 0,
      });
      delete abordDownloads[url];

      // checksum
      if (sha256) {
        const checksum = await generateSha256(tmpFilename);
        if (checksum !== sha256) {
          reject(new Error('Invalid downloaded file checksum'));
          return;
        }
      }

      resolve(tmpFilename);
    });
    writer.on('error', (error) => {
      reject(error);
    });
  });
}

export function cancelDownload(url: string): boolean {
  const controller = abordDownloads[url];
  if (controller) {
    controller.abort();
    return true;
  }

  return false;
}

export async function generateSha256(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const fd = fs.createReadStream(filepath);

    fd.on('error', reject);

    fd.on('data', function (chunk) {
      hash.update(chunk);
    });

    fd.on('close', function () {
      resolve(hash.digest('hex'));
    });
  });
}
