import { App, ipcMain } from 'electron';
import settings from 'electron-settings';
import { appLogger } from './app-logger';
import { v4 as uuidv4 } from 'uuid';
import { appContext } from './app-context';

const DEFAULT_SETTINGS: {
  [k: string]: string | number | boolean | { [k: string]: string };
} = {
  wsPort: 5610,
  debug: false,
  isoRaspios: false,
  isoLocal: false,
  locale: 'en',
  proxyMode: 'noproxy',
  proxyHost: 'localhost',
  proxyPort: 8080,
  crashReport: true,
  firstRun: true,
  uuid: null,
  devices: {},
};

// copied from electron-settings that not exports those types
export type SettingsObject = {
  [key: string]: SettingsValue;
};

export type SettingsValue = null | boolean | string | number | SettingsObject | SettingsValue[];

export type KeyPath = string;

export interface KeyValue {
  key: KeyPath;
  value: SettingsValue;
}

export class AppSettings {
  constructor() {
    settings.configure({ prettify: true });
  }

  public configure(app: App): void {
    this.checkAndFixConfig(app.getVersion());
    this.addIpcs();
  }

  public getAll(): SettingsObject {
    return settings.getSync();
  }

  public get<T>(keyPath: KeyPath): T {
    return settings.getSync(keyPath) as unknown as T;
  }

  public setAll(obj: SettingsObject): void {
    settings.setSync(obj);
  }

  public set(keyPath: KeyPath, value: SettingsValue): void {
    settings.setSync(keyPath, value);
  }

  public has(keyPath: KeyPath): boolean {
    return settings.hasSync(keyPath);
  }

  public filepath(): string {
    return settings.file();
  }

  private addIpcs() {
    ipcMain.handle('settings-get-all', () => {
      return this.getAll();
    });

    ipcMain.handle('settings-set-all', (_event, arg: SettingsObject) => {
      if (typeof arg !== 'object' || Array.isArray(arg) || arg === null) {
        appLogger.error('Specified settings have invalid format', arg);
        return false;
      }
      // TODO check values

      this.setAll(arg);
      return true;
    });

    ipcMain.handle('settings-get', (_event, arg: KeyPath) => {
      return this.get(arg);
    });

    ipcMain.handle('settings-get-selected', (_event, arg: KeyPath[]) => {
      const result: Record<string, unknown> = {};
      for (const keyPath of arg) {
        result[keyPath] = this.get(keyPath);
      }
      return result;
    });

    ipcMain.on('settings-set', (_event, arg: KeyValue) => {
      this.set(arg.key, arg.value);
    });

    ipcMain.handle('settings-filepath', () => {
      return this.filepath();
    });

    ipcMain.handle('settings.has', (_event, arg: KeyPath) => {
      return this.has(arg);
    });
  }

  private checkAndFixConfig(version: string) {
    // cleep section
    if (appContext.isDev) {
      version += 'dev';
    }
    settings.setSync('cleep.version', version);
    if (!settings.hasSync('cleep.isoraspios')) {
      settings.setSync('cleep.isoraspios', DEFAULT_SETTINGS.isoRaspios);
    }
    if (!settings.hasSync('cleep.isolocal')) {
      settings.setSync('cleep.isolocal', DEFAULT_SETTINGS.isoLocal);
    }
    if (!settings.hasSync('cleep.locale')) {
      settings.setSync('cleep.locale', DEFAULT_SETTINGS.locale);
    }
    if (!settings.hasSync('cleep.debug')) {
      settings.setSync('cleep.debug', DEFAULT_SETTINGS.debug);
    }
    settings.setSync('cleep.isdev', appContext.isDev);
    if (!settings.hasSync('cleep.crashreport')) {
      settings.setSync('cleep.crashreport', DEFAULT_SETTINGS.crashReport);
    }
    if (appContext.isDev) {
      settings.setSync('cleep.crashreport', false);
    }
    if (!settings.hasSync('cleep.uuid')) {
      settings.setSync('cleep.uuid', uuidv4());
    }
    if (!settings.hasSync('cleep.lastupdatecheck')) {
      settings.setSync('cleep.lastupdatecheck', 0);
    }
    if (!settings.hasSync('cleep.autoupdate')) {
      settings.setSync('cleep.autoupdate', true);
    }

    // flashtool section
    if (!settings.hasSync('flashtool.version')) {
      settings.setSync('flashtool.version', '');
    }

    // remote section
    if (!settings.hasSync('remote.wsport')) {
      settings.setSync('remote.wsport', DEFAULT_SETTINGS.wsPort);
    }

    // proxy section
    if (!settings.hasSync('proxy.mode')) {
      settings.setSync('proxy.mode', DEFAULT_SETTINGS.proxyMode);
    }
    if (!settings.hasSync('proxy.host')) {
      settings.setSync('proxy.host', DEFAULT_SETTINGS.proxyHost);
    }
    if (!settings.hasSync('proxy.port')) {
      settings.setSync('proxy.port', DEFAULT_SETTINGS.proxyPort);
    }

    // firstrun section
    if (!settings.hasSync('cleep.firstrun')) {
      settings.setSync('cleep.firstrun', DEFAULT_SETTINGS.firstRun);
    }

    // devices
    if (!settings.hasSync('devices')) {
      settings.setSync('devices', DEFAULT_SETTINGS.devices);
    }
  }
}

export const appSettings = new AppSettings();
