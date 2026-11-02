import '../../src/app-logger';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { appDeveloper, deviceHasDeveloperApp } from '../../src/app-developer';
import { appDevices } from '../../src/app-devices';
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
    appSettings.set('devices', {});
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('configure registers developer-get-status ipc handler', () => {
    appDeveloper.configure();
    expect(ipcHandleHandlers.has('developer-get-status')).toBe(true);
  });

  it('reports disabled status by default', () => {
    expect(appDeveloper.getStatus()).toEqual({
      enabled: false,
      sourcesDir: '',
      sourcesOk: false,
      deviceUuid: '',
      deviceOk: false,
      hasDeveloperDevice: false,
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
    expect(
      deviceHasDeveloperApp(
        makeDevice({
          uuid: 'desktop',
          cleepdesktop: true,
          extra: { apps: ['developer'] },
        }),
      ),
    ).toBe(false);
  });

  it('marks sourcesOk false when enabled without a folder', () => {
    appSettings.set('cleep.developer', true);
    appSettings.set('cleep.developersources', '');
    expect(appDeveloper.getStatus()).toMatchObject({
      enabled: true,
      sourcesDir: '',
      sourcesOk: false,
    });
  });

  it('marks device status from known devices and selection', () => {
    const withDeveloper = makeDevice({
      uuid: 'pi-dev',
      hostname: 'cleepdev',
      extra: { apps: ['developer', 'update'] },
    });
    const withoutDeveloper = makeDevice({
      uuid: 'pi-plain',
      hostname: 'livingroom',
      extra: { apps: ['update'] },
    });
    appSettings.set('devices', {
      'pi-dev': withDeveloper,
      'pi-plain': withoutDeveloper,
    });
    // Reload devices map from settings the way AppDevices does at configure time.
    (appDevices as unknown as { devices: Record<string, CleepbusPeerInfos> }).devices = {
      'pi-dev': withDeveloper,
      'pi-plain': withoutDeveloper,
    };

    appSettings.set('cleep.developer', true);
    appSettings.set('cleep.developerdevice', '');
    expect(appDeveloper.getStatus()).toMatchObject({
      enabled: true,
      hasDeveloperDevice: true,
      deviceUuid: '',
      deviceOk: false,
    });

    appSettings.set('cleep.developerdevice', 'pi-plain');
    expect(appDeveloper.getStatus()).toMatchObject({
      hasDeveloperDevice: true,
      deviceUuid: 'pi-plain',
      deviceOk: false,
    });

    appSettings.set('cleep.developerdevice', 'pi-dev');
    expect(appDeveloper.getStatus()).toMatchObject({
      hasDeveloperDevice: true,
      deviceUuid: 'pi-dev',
      deviceOk: true,
    });
  });

  it('marks sourcesOk true when the folder exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-dev-sources-'));
    tempDirs.push(dir);
    appSettings.set('cleep.developer', true);
    appSettings.set('cleep.developersources', dir);

    expect(appDeveloper.getStatus()).toMatchObject({
      enabled: true,
      sourcesDir: dir,
      sourcesOk: true,
    });

    appDeveloper.configure();
    await expect(ipcHandleHandlers.get('developer-get-status')()).resolves.toMatchObject({
      ok: true,
      data: {
        enabled: true,
        sourcesDir: dir,
        sourcesOk: true,
      },
    });
  });
});
