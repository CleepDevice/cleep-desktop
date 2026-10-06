import { appLogger } from '../app-logger';
import axios from 'axios';

export interface IGithubRepo {
  owner: string;
  repo: string;
}

export interface IGithubRelease {
  assets: IGithubAsset[];
  tag: string;
  error?: string;
}

export interface IGithubAsset {
  url: string;
  browser_download_url: string;
  id: number;
  node_id: string;
  name: string;
  label: string | null;
  state: 'uploaded' | 'open';
  content_type: string;
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  uploader: unknown;
}

export interface IReleaseInfos {
  downloadUrl: string;
  size: number;
  filename: string;
}

export interface IRelease {
  version: string;
  darwin: IReleaseInfos;
  linux: IReleaseInfos;
  win32: IReleaseInfos;
  error?: string;
}

interface IRealGithubRelease {
  url: string;
  html_url: string;
  assets_url: string;
  upload_url: string;
  id: number;
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  author: {
    login: string;
    id: number;
    site_admin: boolean;
  };
  assets: IGithubAsset[];
}

const LATEST_RELEASE_URL = 'https://api.github.com/repos/$OWNER$/$REPO$/releases?page=1&per_page=1';
const RELEASE_BY_TAG_URL = 'https://api.github.com/repos/$OWNER$/$REPO$/releases/tags/$TAG$';
const GIHHUB_HEADERS = {
  accept: 'application/vnd.github+json',
};

function getGithubStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }
  if (axios.isAxiosError(error)) {
    return error.response?.status;
  }
  return undefined;
}

function getGithubErrorMessage(error: unknown): string {
  if (isGithubRateLimitError(error)) {
    return 'Too many requests. Retry in few minutes.';
  }
  const status = getGithubStatus(error);
  if (status === 404) {
    return 'Release not found (404)';
  }
  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }
  return 'Unknown error';
}

function isGithubRateLimitError(error: unknown): boolean {
  const status = getGithubStatus(error);
  return status === 403 || status === 429;
}

export async function getLatestGithubRelease(repo: IGithubRepo): Promise<IGithubRelease> {
  try {
    appLogger.debug(`Getting latest release for repo ${repo.owner}:${repo.repo}`);
    const url = LATEST_RELEASE_URL.replace('$OWNER$', repo.owner).replace('$REPO$', repo.repo);
    const releases = await axios.get<IRealGithubRelease[]>(url, { headers: GIHHUB_HEADERS, timeout: 10000.0 });
    const latestRelease = releases.data[0];
    appLogger.debug('Github latest release response', JSON.stringify(latestRelease));

    return {
      assets: latestRelease.assets,
      tag: latestRelease.tag_name,
    };
  } catch (error) {
    appLogger.error('Unable to call github api', error);
    const errorMessage = getGithubErrorMessage(error);
    return {
      assets: [],
      tag: '',
      error: `Unable to request Github (${errorMessage})`,
    };
  }
}

export async function getGithubReleaseByTag(repo: IGithubRepo, tag: string): Promise<IGithubRelease> {
  try {
    appLogger.debug(`Getting release ${tag} for repo ${repo.owner}:${repo.repo}`);
    const url = RELEASE_BY_TAG_URL.replace('$OWNER$', repo.owner)
      .replace('$REPO$', repo.repo)
      .replace('$TAG$', encodeURIComponent(tag));
    const release = await axios.get<IRealGithubRelease>(url, { headers: GIHHUB_HEADERS, timeout: 10000.0 });
    return {
      assets: release.data.assets ?? [],
      tag: release.data.tag_name,
    };
  } catch (error) {
    appLogger.error('Unable to call github api for release tag', { error, tag });
    const errorMessage = getGithubErrorMessage(error);
    return {
      assets: [],
      tag: '',
      error: `Unable to request Github (${errorMessage})`,
    };
  }
}
