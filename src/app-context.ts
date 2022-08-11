import { app, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import { appLogger } from './app-logger';
import path from 'path';
import fs from 'fs';
import * as Sentry from '@sentry/electron';

class AppContext {
  public allowQuit = true;
  public closingApplication = false; // TODO
  public version: string;
  public changelog: string;

  constructor() {
    if (isDev) {
      this.version = require('./package.json').version;
    } else {
      this.version = app.getVersion();
    }
    this.loadChangelog();
    this.configureCrashReport();
    this.addIpcs();
  }

  private addIpcs(): void {
    ipcMain.handle('get-changelog', async () => {
      return this.changelog;
    });
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

  public getChangelogFilesize(): number {
    const changelogPath = this.getChangelogPath();
    return fs.statSync(changelogPath).size;
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

  public getChangelog(): string {
    return this.changelog;
  }

  private configureCrashReport(): void {
    if (!isDev) {
      appLogger.info('Crash report is enabled');
      Sentry.init({
        dsn: 'https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385',
      });
    } else {
      appLogger.info('Crash report is disabled');
    }
  }
}

export const appContext = new AppContext();
