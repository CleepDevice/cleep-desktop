import { app } from 'electron';
import isDev from 'electron-is-dev';
import { appLogger } from './app-logger';
import path from 'path';
import fs from 'fs';

class AppContext {
  public allowQuit = true;
  public closingApplication = false;
  public rpcPort = 0;
  public coreDisabled = false;
  public isDev: boolean;
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  public coreProcess: any;
  public version: string;
  public changelog: string;

  constructor() {
    this.isDev = isDev;
    if (this.isDev) {
      this.version = require('./package.json').version;
    } else {
      this.version = app.getVersion();
    }

    this.loadChangelog();
    this.configureCrashReport();
  }

  public saveChangelog(changelog: string): void {
    const changelogPath = this.getChangelogPath();
    try {
      fs.writeFileSync(changelogPath, changelog);
    } catch (error) {
      const msg = error?.message || 'unknown error';
      appLogger.error(`Unable to save changelog: ${msg}`);
    }
  }

  public loadChangelog(): void {
    const changelogPath = this.getChangelogPath();
    const changelogExists = fs.existsSync(changelogPath);
    if (!changelogExists) {
      appLogger.debug('Create changelog.txt file');
      this.saveChangelog('');
      this.changelog = '';
      return;
    }

    this.changelog = fs.readFileSync(changelogPath, { encoding: 'utf8' });
    appLogger.debug('Changelog: ' + this.changelog);
  }

  private getChangelogPath(): string {
    return path.join(app.getPath('userData'), 'changelog.txt');
  }

  private configureCrashReport(): void {
    if (!this.isDev) {
      appLogger.info('Enable crash report');
      const { init } = require('@sentry/electron');
      init({
        dsn: 'https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385',
      });
    }
  }
}

export const appContext = new AppContext();
