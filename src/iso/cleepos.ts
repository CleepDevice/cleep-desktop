import { Octokit } from '@octokit/rest';
import { appLogger } from '../app-logger';
import { getChecksumFromUrl, getFilenameFromUrl, ReleaseInfo } from './utils';

export class CleepOs {
  private readonly CLEEPOS_REPO = { owner: 'tangb', repo: 'cleep-os' };
  private github: Octokit;

  constructor() {
    this.github = new Octokit();
  }

  public async getLatestRelease(): Promise<ReleaseInfo> {
    const latestRelease = await this.github.rest.repos.getLatestRelease(this.CLEEPOS_REPO);
    appLogger.debug('Cleepos Github result', JSON.stringify(latestRelease.data));

    const isoAsset = latestRelease.data.assets.find((asset) => asset.name.indexOf('.zip') >= 0);
    const checksumAsset = latestRelease.data.assets.find((asset) => asset.name.indexOf('.sha256') >= 0);
    const sha256 = await getChecksumFromUrl(checksumAsset?.browser_download_url);

    return {
      url: isoAsset?.browser_download_url,
      size: isoAsset?.size,
      filename: getFilenameFromUrl(isoAsset?.browser_download_url),
      label: this.getCleanFilename(isoAsset?.name),
      date: new Date(isoAsset?.updated_at),
      sha256,
      category: 'cleepos',
    };
  }

  private getCleanFilename(filename: string): string {
    return this.capitalize(filename.replace('.zip', '').replace('_', ' '));
  }

  private capitalize(sentence: string): string {
    return sentence.toLowerCase().replace(/\w/, (firstLetter) => firstLetter.toUpperCase());
  }
}
