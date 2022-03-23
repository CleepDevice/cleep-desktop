import axios from 'axios';
import path from 'path';

export const HEADERS = { 'user-agent': 'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0' };

export type ReleaseCategory = 'raspios' | 'cleepos';

export interface ReleaseInfo {
  url: string;
  sha256: string;
  date: Date;
  filename: string;
  label: string;
  category: ReleaseCategory;
  size?: number;
}

export async function getChecksumFromUrl(url: string): Promise<string> {
  const { data, status } = await axios.get<string>(url, { headers: HEADERS });
  return status === 200 ? data.split(' ', 1)[0] : null;
}

export function getFilenameFromUrl(url: string): string {
  const anUrl = new URL(url);
  return path.basename(anUrl.pathname);
}
