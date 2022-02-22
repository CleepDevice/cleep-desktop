import { app, ipcMain } from 'electron';
import settings from 'electron-settings';
import isDev from 'electron-is-dev';
import { appLogger } from './app-logger';

const DEFAULT_SETTINGS: {
  [k: string]: string | number | boolean | { [k: string]: string };
} = {
  rpcPort: 5610,
  debug: false,
  isoRaspios: false,
  isoLocal: false,
  locale: 'en',
  proxyMode: 'noproxy',
  proxyHost: 'localhost',
  proxyPort: 8080,
  crashReport: true,
  firstRun: true,
  externalUuid: null,
  devices: {},
};

// copied from electron-settings that not exports those types
export type SettingsObject = {
  [key: string]: SettingsValue;
};

export type SettingsValue = null | boolean | string | number | SettingsObject | SettingsValue[];

export type KeyPath = string | Array<string | number>;

export interface KeyValue {
  key: KeyPath;
  value: SettingsValue;
}

export class AppSettings {
  constructor() {
    settings.configure({ prettify: true });
    this.checkAndFixConfig();
    this.addIpcs();
  }

  public get(keyPath: KeyPath): SettingsValue {
    return settings.getSync(keyPath);
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
    ipcMain.on('settings-get', (event, arg: KeyPath) => {
      event.returnValue = this.get(arg);
    });

    ipcMain.on('settings-set', (_event, arg: KeyValue) => {
      this.set(arg.key, arg.value);
    });

    ipcMain.on('settings-filepath', (event) => {
      event.returnValue = this.filepath();
    });

    ipcMain.on('settings.has', (event, arg: KeyPath) => {
      event.returnValue = this.get(arg);
    });
  }

  private checkAndFixConfig() {
    // cleep section
    if (isDev) {
      settings.setSync('cleep.version', require('./package.json').version);
    } else {
      settings.setSync('cleep.version', app.getVersion());
    }
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
    settings.setSync('cleep.isdev', isDev);
    if (!settings.hasSync('cleep.crashreport')) {
      settings.setSync('cleep.crashreport', DEFAULT_SETTINGS.crashReport);
    }
    if (isDev) {
      settings.setSync('cleep.crashreport', false);
    }
    if (!settings.hasSync('cleep.externaluuid')) {
      settings.setSync('cleep.externaluuid', DEFAULT_SETTINGS.externalUuid);
    }

    // etcher section
    if (!settings.hasSync('etcher.version')) {
      settings.setSync('etcher.version', 'v0.0.0');
    }

    // remote section
    if (!settings.hasSync('remote.rpcport')) {
      settings.setSync('remote.rpcport', DEFAULT_SETTINGS.rpcPort);
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
