import '../../src/app-logger';
import { describe, expect, it } from 'vitest';
import { appSettings } from '../../src/app-settings';
import { ipcHandleHandlers, ipcOnHandlers } from '../setup';

describe('AppSettings', () => {
  it('get/set/has/filepath work through electron-settings', () => {
    appSettings.set('proxy.host', '127.0.0.1');
    expect(appSettings.get<string>('proxy.host')).toBe('127.0.0.1');
    expect(appSettings.has('proxy.host')).toBe(true);
    expect(appSettings.filepath()).toContain('settings.json');
  });

  it('getAll and setAll round-trip', () => {
    appSettings.setAll({ custom: { enabled: true } });
    const all = appSettings.getAll();
    expect(all).toMatchObject({ custom: { enabled: true } });
  });

  it('configure fills missing defaults and registers ipc handlers', () => {
    const app = { getVersion: () => '1.2.3' } as Electron.App;
    appSettings.configure(app);

    expect(appSettings.get<string>('cleep.version')).toBe('1.2.3');
    expect(appSettings.get<boolean>('cleep.isoraspios')).toBe(false);
    expect(appSettings.get<boolean>('cleep.isolocal')).toBe(false);
    expect(appSettings.get<string>('cleep.locale')).toBe('en');
    expect(appSettings.get<boolean>('cleep.isdev')).toBe(false);
    expect(appSettings.has('rpiimager.version')).toBe(true);
    expect(appSettings.get<number>('remote.wsport')).toBe(5610);
    expect(appSettings.get<string>('proxy.mode')).toBe('noproxy');
    expect(appSettings.get<boolean>('cleep.firstrun')).toBe(true);

    expect(ipcHandleHandlers.has('settings-get-all')).toBe(true);
    expect(ipcHandleHandlers.has('settings-set-all')).toBe(true);
    expect(ipcHandleHandlers.has('settings-get')).toBe(true);
    expect(ipcHandleHandlers.has('settings-get-selected')).toBe(true);
    expect(ipcHandleHandlers.has('settings-filepath')).toBe(true);
    expect(ipcHandleHandlers.has('settings.has')).toBe(true);
    expect(ipcOnHandlers.has('settings-set')).toBe(true);
  });

  it('ipc handlers read and write settings', () => {
    appSettings.configure({ getVersion: () => '9.9.9' } as Electron.App);

    expect(ipcHandleHandlers.get('settings-get-all')()).toMatchObject({
      ok: true,
      data: { cleep: expect.any(Object) },
    });
    expect(ipcHandleHandlers.get('settings-set-all')({}, null)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SETTINGS' },
    });
    expect(ipcHandleHandlers.get('settings-set-all')({}, [])).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SETTINGS' },
    });
    expect(ipcHandleHandlers.get('settings-set-all')({}, { foo: 'bar' })).toEqual({ ok: true, data: true });
    expect(appSettings.get<string>('foo')).toBe('bar');

    expect(ipcHandleHandlers.get('settings-get')({}, 'foo')).toEqual({ ok: true, data: 'bar' });
    expect(ipcHandleHandlers.get('settings-get-selected')({}, ['foo', 'cleep.locale'])).toEqual({
      ok: true,
      data: {
        foo: 'bar',
        'cleep.locale': 'en',
      },
    });
    expect(ipcHandleHandlers.get('settings-filepath')()).toMatchObject({
      ok: true,
      data: expect.stringContaining('settings.json'),
    });
    expect(ipcHandleHandlers.get('settings.has')({}, 'foo')).toEqual({ ok: true, data: true });

    ipcOnHandlers.get('settings-set')({}, { key: 'proxy.port', value: 9999 });
    expect(appSettings.get<number>('proxy.port')).toBe(9999);
  });
});
