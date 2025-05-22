import { getChecksumFromUrl, getFilenameFromUrl, IIsoReleaseInfo } from './utils';
import { getLatestRelease, IGithubRepo } from '../utils/github';

export class CleepOs {
  private readonly CLEEPOS_REPO: IGithubRepo = { owner: 'CleepDevice', repo: 'cleep-os' };

  public async getLatestRelease(): Promise<IIsoReleaseInfo> {
    const latestRelease = await getLatestRelease(this.CLEEPOS_REPO);

    const isoAsset = latestRelease.assets.find((asset) => asset.name.indexOf('.zip') >= 0);
    const checksumAsset = latestRelease.assets.find((asset) => asset.name.indexOf('.sha256') >= 0);
    const sha256 = await getChecksumFromUrl(checksumAsset?.browser_download_url);

    return {
      url: isoAsset?.browser_download_url,
      size: isoAsset?.size,
      filename: getFilenameFromUrl(isoAsset?.browser_download_url),
      label: this.getCleanFilename(isoAsset?.name),
      date: new Date(isoAsset?.updated_at),
      sha256,
      category: 'cleepos',
      error: latestRelease.error,
    };
  }

  private getCleanFilename(filename: string): string {
    return this.capitalize(filename.replace('.zip', '').replace('_', ' '));
  }

  private capitalize(sentence: string): string {
    return sentence.toLowerCase().replace(/\w/, (firstLetter) => firstLetter.toUpperCase());
  }
}
