import { app, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import { appLogger } from './app-logger';
import path from 'path';
import fs from 'fs';
import * as Sentry from '@sentry/electron';
import { appSettings } from './app-settings';

const SENTRY_DSN = 'https://8e703f88899c42c18b8466c44b612472@o97410.ingest.sentry.io/213385';

class AppContext {
  public allowAppClosing = true;
  public closingApplication = false;
  public version: string;
  public changelog: string;

  constructor() {
    if (isDev) {
      this.version = require('./package.json').version;
    } else {
      this.version = app.getVersion();
    }
  }

  public configure(): void {
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
    if (isDev) {
      appLogger.info('Crash report disabled during development');
      return;
    }

    const crashReport = appSettings.get<boolean>('cleep.crashreport');
    if (crashReport) {
      appLogger.info('Crash report enabled');
      Sentry.init({ dsn: SENTRY_DSN });
    } else {
      appLogger.info('Crash report disabled');
    }
  }
}

export const appContext = new AppContext();
