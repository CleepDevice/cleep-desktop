import { BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { sendDataToAngularJs } from './utils/ui.helpers';

export interface IAuth {
  deviceUuid: string;
  account: string;
  password: string;
  attempts: number;
  timestamp: number;
}

export interface IAuthEvent {
  url: string;
  deviceUuid: string;
  account: string;
  password: string;
}

export const MAX_AUTH_ATTEMPTS = 5;
const TTL = 30 * 60 * 1000; // 30 mins in ms
const PURGE_DELAY = 5 * 60 * 1000; // 5 mins in ms

class AppAuth {
  private auths: Record<string, IAuth> = {};
  private window: BrowserWindow;

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();

    setInterval(this.purgeObsoleteAuths.bind(this), PURGE_DELAY);
  }

  public getAuth(url: string): IAuth {
    if (this.auths[url]) {
      this.auths[url].attempts += 1;
    }
    return this.auths[url];
  }

  public resetAuthAttempts(url: string): void {
    if (this.auths[url]?.attempts) {
      this.auths[url].attempts = 0;
    }
  }

  private purgeObsoleteAuths(): void {
    const now = new Date().valueOf();
    const authUrlToDelete = Object.entries(this.auths).reduce((acc, [url, auth]) => {
      if (now >= auth.timestamp + TTL) {
        acc.push(url);
      }
      return acc;
    }, []);

    for (const url of authUrlToDelete) {
      appLogger.debug(`Purging auth for url ${url}`);

      sendDataToAngularJs(this.window, 'device-auth-updated', {
        deviceUuid: this.auths[url].deviceUuid,
        hasAuthStored: false,
      });

      delete this.auths[url];
    }
  }

  private addIpcs(): void {
    ipcMain.handle('update-device-auth', (_event, auth: IAuthEvent) => {
      appLogger.debug('Add new auth data', auth);

      const url = new URL(auth.url);
      this.auths[url.hostname] = {
        account: auth.account,
        password: auth.password,
        attempts: 0,
        timestamp: new Date().valueOf(),
        deviceUuid: auth.deviceUuid,
      };

      // return back device has auth to angular
      sendDataToAngularJs(this.window, 'device-auth-updated', {
        deviceUuid: auth.deviceUuid,
        hasAuthStored: true,
      });

      return true;
    });
  }
}

export const appAuth = new AppAuth();
