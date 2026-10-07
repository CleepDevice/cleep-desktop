import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { appContext } from '../../src/app-context';
import { ipcHandleHandlers, USER_DATA_DIR } from '../setup';

const changelogPath = path.join(USER_DATA_DIR, 'changelog.txt');

describe('AppContext', () => {
  afterEach(() => {
    if (fs.existsSync(changelogPath)) {
      fs.rmSync(changelogPath, { force: true });
    }
    appContext.changelog = undefined;
  });

  it('exposes packaged version without -dev suffix', () => {
    expect(appContext.version).toBe('0.0.0-test');
    expect(appContext.isDev).toBe(false);
  });

  it('creates changelog file when missing and loads it', () => {
    appContext.loadChangelog();

    expect(fs.existsSync(changelogPath)).toBe(true);
    expect(appContext.getChangelog()).toBe('');
  });

  it('saves and reloads changelog content', () => {
    appContext.saveChangelog('## 1.0.0\n- first');
    appContext.loadChangelog();

    expect(appContext.getChangelog()).toBe('## 1.0.0\n- first');
    expect(appContext.getChangelogFilesize()).toBe(Buffer.byteLength('## 1.0.0\n- first'));
  });

  it('configure loads changelog, disables crash report in packaged mode when disabled, and adds ipc', () => {
    appContext.saveChangelog('notes');
    appContext.configure();

    expect(appContext.getChangelog()).toBe('notes');
    expect(appContext.crashReportEnabled).toBe(false);
    expect(ipcHandleHandlers.get('get-changelog')()).toEqual({ ok: true, data: 'notes' });
  });

  it('enables crash report when setting is true in packaged mode', async () => {
    const { appSettings } = await import('../../src/app-settings');
    const sentry = await import('@sentry/electron/main');
    appSettings.set('cleep.crashreport', true);

    (appContext as unknown as { configureCrashReport: () => void }).configureCrashReport();
    expect(appContext.crashReportEnabled).toBe(true);
    expect(sentry.init).toHaveBeenCalled();
    appSettings.set('cleep.crashreport', false);
  });
});
