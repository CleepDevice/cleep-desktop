import axios from 'axios';
import { findMatches } from '../utils';
import { getChecksumFromUrl, HEADERS, ReleaseInfo } from './utils';

const RASPIOS_LITE_URL = 'https://downloads.raspberrypi.org/raspios_lite_armhf/images/';
const RASPIOS_FULL_URL = 'https://downloads.raspberrypi.org/raspios_full_armhf/images/';
const RELEASE_PATTERN = /href="(raspios_(full|lite)_armhf-(\d*-\d*-\d*)\/)"/gu;
const RELEASE_INFO_PATTERN = /href="(.*?[zip|sha1|sha256])"/gu;

export interface RaspiOsRelease {
  date: Date;
  url: string;
  type: string;
}

export interface RaspiosLatestRelease {
  full: ReleaseInfo;
  lite: ReleaseInfo;
}

export class RaspiOs {
  public async getReleases(): Promise<RaspiosLatestRelease> {
    const fullReleases = await this.parseRootUrl(RASPIOS_FULL_URL);
    fullReleases.sort((rA, rB) => rA.date.getTime() - rB.date.getTime()).reverse();
    const liteReleases = await this.parseRootUrl(RASPIOS_LITE_URL);
    liteReleases.sort((rA, rB) => rA.date.getTime() - rB.date.getTime()).reverse();

    const latestFullRelease = fullReleases.length ? fullReleases[0] : null;
    const latestLiteRelease = liteReleases.length ? liteReleases[0] : null;

    const full = await this.parseReleaseUrl(latestFullRelease);
    const lite = await this.parseReleaseUrl(latestLiteRelease);
    return { full, lite };
  }

  private async parseRootUrl(url: string): Promise<RaspiOsRelease[]> {
    const { data: html } = await axios.get<string>(url, { headers: HEADERS });

    const matches: string[][] = [];
    findMatches(RELEASE_PATTERN, html, matches);
    // appLogger.debug('Found Raspios matches', matches);

    const releases: RaspiOsRelease[] = [];
    for (const match of matches) {
      releases.push({
        url: `${url}${match[1]}`,
        type: match[2],
        date: new Date(match[3]),
      });
    }

    return releases;
  }

  private async parseReleaseUrl(release: RaspiOsRelease): Promise<ReleaseInfo> {
    const { data: html } = await axios.get<string>(release.url, { headers: HEADERS });

    const matches: string[][] = [];
    findMatches(RELEASE_INFO_PATTERN, html, matches);
    // appLogger.debug('Found Raspios release info matches', matches);

    const info: ReleaseInfo = {
      sha256: null,
      url: null,
      date: release.date,
      filename: this.getCleanFilename(release),
      category: 'raspios',
    };
    for (const match of matches) {
      if (match[1].endsWith('.zip')) {
        info.url = `${release.url}${match[1]}`;
      }
      if (match[1].endsWith('.sha256')) {
        const url = `${release.url}${match[1]}`;
        info.sha256 = await getChecksumFromUrl(url);
      }
    }

    return info;
  }

  private getCleanFilename(release: RaspiOsRelease): string {
    const type = release.type === 'full' ? 'with desktop' : 'Lite';
    return `Raspberry Pi OS ${type}`;
  }
}
