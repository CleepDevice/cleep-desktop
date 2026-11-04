import { App } from 'electron';
import settings from 'electron-settings';
import { v4 as uuidv4 } from 'uuid';
import { appContext } from './app-context';
import { handleInvoke, ipcOk, onRendererSend } from './ipc/ipc-main';

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
  networkInterface: '',
  uuid: null,
  devices: {},
  developer: false,
  developerSources: '',
  developerDevice: '',
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
    // Skip first-run welcome modal during Playwright smoke runs.
    if (process.env.CLEEPDESKTOP_E2E === '1') {
      settings.setSync('cleep.firstrun', false);
    }
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
    handleInvoke('settings-get-all', () => ipcOk(this.getAll()));

    handleInvoke('settings-set-all', (_event, arg) => {
      this.setAll(arg);
      void import('./app-developer').then(({ appDeveloper }) => {
        void appDeveloper.reconcileWatcher();
      });
      return ipcOk(true as const);
    });

    handleInvoke('settings-get', (_event, arg) => ipcOk(this.get(arg)));

    handleInvoke('settings-get-selected', (_event, arg) => {
      const result: Record<string, unknown> = {};
      for (const keyPath of arg) {
        result[keyPath] = this.get(keyPath);
      }
      return ipcOk(result);
    });

    onRendererSend('settings-set', (_event, arg) => {
      this.set(arg.key, arg.value);
      if (String(arg.key).startsWith('cleep.developer')) {
        void import('./app-developer').then(({ appDeveloper }) => {
          void appDeveloper.reconcileWatcher();
        });
      }
    });

    handleInvoke('settings-filepath', () => ipcOk(this.filepath()));

    handleInvoke('settings.has', (_event, arg) => ipcOk(this.has(arg)));
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
    if (!settings.hasSync('cleep.networkinterface')) {
      settings.setSync('cleep.networkinterface', DEFAULT_SETTINGS.networkInterface);
    }
    if (!settings.hasSync('cleep.apiurl')) {
      // Empty = hide website auth toolbar button until Preferences → Network sets a URL.
      settings.setSync('cleep.apiurl', '');
    }
    if (!settings.hasSync('cleep.websiteemail')) {
      settings.setSync('cleep.websiteemail', '');
    }
    if (!settings.hasSync('cleep.websitenickname')) {
      settings.setSync('cleep.websitenickname', '');
    }
    if (!settings.hasSync('cleep.developer')) {
      settings.setSync('cleep.developer', DEFAULT_SETTINGS.developer);
    }
    if (!settings.hasSync('cleep.developersources')) {
      settings.setSync('cleep.developersources', DEFAULT_SETTINGS.developerSources);
    }
    if (!settings.hasSync('cleep.developerdevice')) {
      settings.setSync('cleep.developerdevice', DEFAULT_SETTINGS.developerDevice);
    }
    // Selected local app folders for sync — empty by default (opt-in per app).
    if (!settings.hasSync('cleep.developerapps')) {
      settings.setSync('cleep.developerapps', []);
    }
    // Opt-in sync of local cleep/ core → /root/cleep-dev/ (never touches modules/).
    if (!settings.hasSync('cleep.developercore')) {
      settings.setSync('cleep.developercore', false);
    }

    // rpi-imager section
    if (!settings.hasSync('rpiimager.version')) {
      settings.setSync('rpiimager.version', '');
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
