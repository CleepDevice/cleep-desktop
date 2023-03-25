import { BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { sendDataToAngularJs } from './utils/ui.helpers';

export interface IAuth {
  account: string;
  password: string;
  attempts: number;
}

export interface IAuthEvent {
  url: string;
  deviceUuid: string;
  account: string;
  password: string;
}

export const MAX_AUTH_ATTEMPTS = 5;

class AppAuth {
  private auth: Record<string, IAuth> = {};
  private window: BrowserWindow;

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();
  }

  public getAuth(url: string): IAuth {
    if (this.auth[url]) {
      this.auth[url].attempts += 1;
    }
    return this.auth[url];
  }

  public resetAuthAttempts(url: string): void {
    if (this.auth[url]?.attempts) {
      this.auth[url].attempts = 0;
    }
  }

  private addIpcs(): void {
    ipcMain.handle('update-device-auth', (_event, auth: IAuthEvent) => {
      appLogger.debug('Add new auth data', auth);

      const url = new URL(auth.url);
      this.auth[url.hostname] = {
        account: auth.account,
        password: auth.password,
        attempts: 0,
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
