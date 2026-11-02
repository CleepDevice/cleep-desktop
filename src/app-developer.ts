import fs from 'fs';
import { appDevices } from './app-devices';
import { appSettings } from './app-settings';
import type { CleepbusPeerInfos } from './cleepbus/cleepbus.types';
import { handleInvoke, ipcOk } from './ipc/ipc-main';

/** Module name advertised in peer `apps` when cleepapp-developer is installed. */
export const DEVELOPER_APP_NAME = 'developer';

export type DeveloperStatus = {
  enabled: boolean;
  sourcesDir: string;
  /** True when a sources directory is configured and exists on disk. */
  sourcesOk: boolean;
  /** Selected development device uuid (may be empty). */
  deviceUuid: string;
  /** True when the selected device exists and has cleepapp-developer installed. */
  deviceOk: boolean;
  /** True when at least one known device has cleepapp-developer installed. */
  hasDeveloperDevice: boolean;
};

export function deviceHasDeveloperApp(device: CleepbusPeerInfos | undefined): boolean {
  if (!device || device.cleepdesktop) {
    return false;
  }
  const apps = device.extra?.apps;
  return Array.isArray(apps) && apps.includes(DEVELOPER_APP_NAME);
}

class AppDeveloper {
  public configure(): void {
    handleInvoke('developer-get-status', () => ipcOk(this.getStatus()));
  }

  public getStatus(): DeveloperStatus {
    const enabled = Boolean(appSettings.get<boolean>('cleep.developer'));
    const sourcesDir = String(appSettings.get<string>('cleep.developersources') || '').trim();
    const deviceUuid = String(appSettings.get<string>('cleep.developerdevice') || '').trim();
    const devices = appDevices.getDevices();
    const hasDeveloperDevice = devices.some((device) => deviceHasDeveloperApp(device));
    const selected = deviceUuid ? appDevices.getDevice(deviceUuid) : undefined;
    const deviceOk = deviceHasDeveloperApp(selected);

    return {
      enabled,
      sourcesDir,
      sourcesOk: enabled ? this.isSourcesDirectory(sourcesDir) : false,
      deviceUuid,
      deviceOk: enabled ? deviceOk : false,
      hasDeveloperDevice,
    };
  }

  private isSourcesDirectory(sourcesDir: string): boolean {
    if (!sourcesDir) {
      return false;
    }
    try {
      return fs.statSync(sourcesDir).isDirectory();
    } catch {
      return false;
    }
  }
}

export const appDeveloper = new AppDeveloper();
