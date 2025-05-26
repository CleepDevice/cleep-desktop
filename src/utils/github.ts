import { Octokit } from '@octokit/rest';
import { appLogger } from '../app-logger';

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

export async function getLatestRelease(repo: IGithubRepo): Promise<IGithubRelease> {
  try {
    const latestRelease = await github.rest.repos.getLatestRelease({ owner: repo.owner, repo: repo.repo });
    appLogger.debug(JSON.stringify(latestRelease.data));

    return {
      assets: latestRelease.data.assets,
      tag: latestRelease.data.tag_name,
    };
  } catch (error) {
    appLogger.error('Unable to call github api', error);
    return {
      assets: [],
      tag: '',
      error: 'Unable to request Github',
    };
  }
}

const github = new Octokit();
