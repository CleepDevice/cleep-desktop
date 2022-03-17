import axios from 'axios';
import fs from 'fs';
import path from 'path';
import uuid4 from 'uuid4';
import { app } from 'electron';
import progress_stream, { Progress } from 'progress-stream';
import { appLogger } from './app-logger';

export interface DownloadProgress {
  percent?: number;
  eta?: number;
  terminated?: boolean;
  error?: string;
}

export type OnDownloadProgressCallback = (downloadProgress: DownloadProgress) => void;

const abordDownloads: Record<string, AbortController> = {};

export async function downloadFile(url: string, downloadProgressCallback: OnDownloadProgressCallback): Promise<string> {
  const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0' };
  const tmpFilename = path.join(app.getPath('temp'), uuid4() + '.zip');
  appLogger.debug(`Download file to ${tmpFilename}`);
  const writer = fs.createWriteStream(tmpFilename);

  abordDownloads[url] = new AbortController();

  appLogger.debug(`Download flash-tool from ${url}`);
  const download = await axios({
    url,
    method: 'GET',
    headers,
    responseType: 'stream', 
    signal: abordDownloads[url].signal,
  });
  const totalSize = Number(download.headers['content-length']) || 0;
  appLogger.debug(`File to download size ${totalSize}`);
  const progress = progress_stream({ length: totalSize, time: 1000 })
  download.data.pipe(progress).pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      appLogger.debug('Download file completed');
      downloadProgressCallback({
        percent: 100,
        eta: 0,
      });
      delete abordDownloads[url];
      resolve(tmpFilename);
    });
    writer.on('error', (error) => {
      reject(error);
    });
    progress.on('progress', (progress: Progress) => {
      downloadProgressCallback({
        percent: Math.round(progress.percentage),
        eta: progress.eta
      });
    })
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