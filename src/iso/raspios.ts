import axios from 'axios';

const RASPIOS_LITE_URL = 'https://downloads.raspberrypi.org/raspios_lite_armhf/images/';
const RASPIOS_FULL_URL = 'https://downloads.raspberrypi.org/raspios_full_armhf/images/';
const HEADERS = { 'user-agent': 'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0' };
const RELEASE_PATTERN = /href="(raspios_(full|lite)_armhf-(\d*-\d*-\d*))\/"/gu;

export interface RaspiOsRelease {
  date: Date;
  url: string;
  type: string;
}

export class RaspiOs {
  private async parseBaseUrl(url: string): Promise<RaspiOsRelease[]> {
    const { data: matches } = await axios.get<string>(url, { headers: HEADERS });

    const releases: RaspiOsRelease[] = [];
    // for (const match of matches.matchAll(RELEASE_PATTERN)) {
    //   if (!match[1].startsWith('raspios')) continue;
    //   releases.push({
    //     type: match[2],
    //     date: new Date(Date.parse(match[3])),
    //     url: url + match[1],
    //   });
    // }

    return releases;
  }
}
