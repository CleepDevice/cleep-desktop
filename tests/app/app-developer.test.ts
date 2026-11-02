import '../../src/app-logger';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { appDeveloper, deviceHasDeveloperApp } from '../../src/app-developer';
import { appSettings } from '../../src/app-settings';
import type { CleepbusPeerInfos } from '../../src/cleepbus/cleepbus.types';
import { ipcHandleHandlers } from '../setup';

function makeDevice(partial: Partial<CleepbusPeerInfos> & { uuid: string }): CleepbusPeerInfos {
  return {
    hostname: partial.hostname || partial.uuid,
    ip: partial.ip || '127.0.0.1',
    macs: partial.macs || ['aa:bb:cc:dd:ee:ff'],
    cleepdesktop: partial.cleepdesktop ?? false,
    online: partial.online ?? true,
    extra: partial.extra || {},
    ...partial,
  };
}

describe('AppDeveloper', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    appSettings.set('cleep.developer', false);
    appSettings.set('cleep.developersources', '');
    appSettings.set('cleep.developerdevice', '');
    appSettings.set('cleep.developerapps', []);
    appSettings.set('devices', {});
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('configure registers developer ipc handlers', () => {
    appDeveloper.configure();
    expect(ipcHandleHandlers.has('developer-get-status')).toBe(true);
    expect(ipcHandleHandlers.has('developer-list-apps')).toBe(true);
    expect(ipcHandleHandlers.has('developer-sync-now')).toBe(true);
  });

  it('reports disabled status by default with no selected apps', () => {
    expect(appDeveloper.getStatus()).toMatchObject({
      enabled: false,
      sourcesDir: '',
      sourcesOk: false,
      deviceUuid: '',
      deviceOk: false,
      hasDeveloperDevice: false,
      selectedApps: [],
      appsOk: false,
      sshConfigured: false,
      syncStatus: 'idle',
    });
  });

  it('detects developer app on peer devices', () => {
    expect(
      deviceHasDeveloperApp(
        makeDevice({ uuid: 'dev-1', extra: { apps: ['network', 'developer'] } }),
      ),
    ).toBe(true);
    expect(deviceHasDeveloperApp(makeDevice({ uuid: 'dev-2', extra: { apps: ['network'] } }))).toBe(
      false,
    );
  });

  it('lists apps from sources folder over ipc', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-dev-list-'));
    tempDirs.push(root);
    const backend = path.join(root, 'demo', 'backend');
    fs.mkdirSync(backend, { recursive: true });
    fs.writeFileSync(
      path.join(backend, 'demo.py'),
      'from cleep.core import CleepModule\n\nclass Demo(CleepModule):\n    pass\n',
      'utf8',
    );

    appSettings.set('cleep.developersources', root);
    appDeveloper.configure();
    await expect(ipcHandleHandlers.get('developer-list-apps')()).resolves.toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({
          folderName: 'demo',
          valid: true,
          moduleName: 'demo',
        }),
      ],
    });
  });

  it('keeps appsOk false until a valid app is selected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-dev-sel-'));
    tempDirs.push(root);
    const backend = path.join(root, 'demo', 'backend');
    fs.mkdirSync(backend, { recursive: true });
    fs.writeFileSync(
      path.join(backend, 'demo.py'),
      'from cleep.core import CleepModule\n\nclass Demo(CleepModule):\n    pass\n',
      'utf8',
    );

    appSettings.set('cleep.developer', true);
    appSettings.set('cleep.developersources', root);
    appSettings.set('cleep.developerapps', []);
    expect(appDeveloper.getStatus().appsOk).toBe(false);

    appSettings.set('cleep.developerapps', ['demo']);
    expect(appDeveloper.getStatus().appsOk).toBe(true);
  });
});
