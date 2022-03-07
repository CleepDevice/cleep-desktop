import { BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { appSettings } from './app-settings';
import { CleepOs } from './iso/cleepos';
import { RaspiOs, RaspiosLatestRelease } from './iso/raspios';
import { Wifi, WifiNetwork } from './iso/wifi';
import { ReleaseInfo } from './iso/utils';
import { balena, Drive } from './flash-tool/balena';
import { downloadFile, getError, UpdateData } from './utils';

export interface InstallData {
  url: string;
  drive: string;
  wifi: WifiNetwork;
}

class AppIso {
  private wifiNetworks: WifiNetwork[] = [];
  private lastRaspiosUpdate: number;
  private readonly RASPIOS_CACHE_DURATION = 6 * 60 * 60;
  private raspios: RaspiOs;
  private cleepos: CleepOs;
  private wifi: Wifi;
  private isosReleases: {
    cleepos: ReleaseInfo;
    raspios: RaspiosLatestRelease;
  } = { cleepos: null, raspios: null };
  private window: BrowserWindow;

  constructor() {
    this.raspios = new RaspiOs();
    this.cleepos = new CleepOs();
    this.wifi = new Wifi();
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();
  }

  public async refreshWifiNetworks() {
    try {
      this.wifiNetworks = await this.wifi.refreshNetworks();
    } catch (error) {
      appLogger.error('Unable to get wifi networks', { error });
    }
  }

  public getWifiNetworks(): WifiNetwork[] {
    return this.wifiNetworks;
  }

  public async getLatestRaspios(): Promise<RaspiosLatestRelease> {
    if (!appSettings.get('cleep.isoraspios')) {
      return;
    }

    const now = Math.round(new Date().getTime());
    if (this.isosReleases.raspios && this.lastRaspiosUpdate + this.RASPIOS_CACHE_DURATION < now) {
      return this.isosReleases.raspios;
    }

    try {
      this.isosReleases.raspios = await this.raspios.getReleases();
      appLogger.info('Found raspios releases', this.isosReleases.raspios);
      this.lastRaspiosUpdate = now;
      return this.isosReleases.raspios;
    } catch (error) {
      appLogger.error('Unable to get raspios releases', { error });
    }
  }

  public async getLatestCleepos(): Promise<ReleaseInfo> {
    if (this.isosReleases.cleepos) {
      return this.isosReleases.cleepos;
    }

    this.isosReleases.cleepos = await this.cleepos.getLatestRelease();
    appLogger.info('Found cleepos release', this.isosReleases.cleepos);
    return this.isosReleases.cleepos;
  }

  public async getDriveList(): Promise<Drive[]> {
    const drives = await balena.getDriveList();
    appLogger.info('Found drives', drives);

    return drives;
  }

  public async downloadIso(url: string) {
    try {
      const iso = await downloadFile(url, this.downloadProgressCallback);
      this.downloadProgressCallback({ installed: true });
    } catch (error) {
      appLogger.error(`Error downloading iso: ${error}`);
      this.downloadProgressCallback({ percent: 100, error: getError(error) });
    }
  }

  private downloadProgressCallback(updateData: UpdateData) {
    this.window.webContents.send('updater-cleepdesktop-download-progress', updateData);
  }

  private addIpcs(): void {
    ipcMain.handle('iso-get-isos', async () => {
      const releases = await Promise.all([this.getLatestRaspios(), this.getLatestCleepos()]);
      const [raspios, cleepos] = releases;

      return { raspios, cleepos };
    });

    ipcMain.handle('iso-refresh-wifi-networks', async () => {
      await this.refreshWifiNetworks();
      return this.getWifiNetworks();
    });

    ipcMain.handle('iso-get-wifi-networks', () => {
      return this.getWifiNetworks();
    });

    ipcMain.handle('iso-get-drives', async () => {
      return await this.getDriveList();
    });

    ipcMain.handle('iso-has-wifi', async () => {
      return await this.wifi.hasWifi();
    });

    ipcMain.on('iso-start-install', (_event, installData: InstallData) => {
      appLogger.debug('Start iso install', installData);
    });
  }
}

export const appIso = new AppIso();
