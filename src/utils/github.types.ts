export interface ReleaseInfos {
  downloadUrl: string;
  size: number;
  filename: string;
}

export interface GithubRelease {
  version: string;
  darwin: ReleaseInfos;
  linux: ReleaseInfos;
  win32: ReleaseInfos;
}
