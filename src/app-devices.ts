import { BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { appSettings, SettingsObject } from './app-settings';
import { cleepbus } from './cleepbus/cleepbus';
import { CleebusMessageResponse, CleepbusPeerInfos, TEST_DEVICE } from './cleepbus/cleepbus.types';
import isDev from 'electron-is-dev';
import { sendDataToAngularJs } from './utils/ui.helpers';

class AppDevices {
  private window: BrowserWindow;
  private devices: Record<string, CleepbusPeerInfos> = {};

  constructor() {
    cleepbus.setCleepbusCallbacks(
      this.onMessageBusError.bind(this),
      this.onMessageBusConnected.bind(this),
      this.onMessageBusUpdating.bind(this),
      this.onMessageResponse.bind(this),
      this.onPeerConnected.bind(this),
      this.onPeerDisconnected.bind(this),
    );

    this.loadDevicesFromSettings();
  }

  private loadDevicesFromSettings(): void {
    const devices = appSettings.get('devices');
    Object.assign(this.devices, devices);

    // set all devices not online and wait for message bus peer connection to set online
    for (const device of Object.values(this.devices)) {
      device.online = false;
    }

    if (isDev) {
      this.devices[TEST_DEVICE.uuid] = TEST_DEVICE;
    }
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();

    // send devices list at startup
    this.window.webContents.once('dom-ready', () => {
      sendDataToAngularJs(this.window, 'devices-updated', this.devicesObjectToArray());
    });

    cleepbus.start();
  }

  public stop(): void {
    cleepbus.stop();
  }

  private onMessageBusError(error: string): void {
    appLogger.error('Message bus error', { error });
    sendDataToAngularJs(this.window, 'devices-message-bus-error', error);
  }

  private onMessageBusConnected(connected: boolean): void {
    appLogger.info('Message bus connected', { connected });
    sendDataToAngularJs(this.window, 'devices-message-bus-connected', connected);
  }

  private onMessageBusUpdating(updating: boolean): void {
    appLogger.info('Message bus updating', { updating });
    sendDataToAngularJs(this.window, 'devices-message-bus-updating', updating);
  }

  private onMessageResponse(peerInfos: CleepbusPeerInfos, messageResponse: CleebusMessageResponse): void {
    appLogger.debug('Received message response from Cleepbus', { peerInfos, messageResponse });
    const timestamp = Math.round(new Date().getTime() / 1000);
    sendDataToAngularJs(this.window, 'devices-message', { timestamp, peerInfos, message: messageResponse });
  }

  private onPeerDisconnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer disconnected', { peerInfos });
    this.updateDevices(peerInfos);
    sendDataToAngularJs(this.window, 'devices-updated', this.devicesObjectToArray());
  }

  private onPeerConnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer connected', { uuid: peerInfos.uuid });
    this.updateDevices(peerInfos);
    sendDataToAngularJs(this.window, 'devices-updated', this.devicesObjectToArray());
  }

  private updateDevices(peerInfos: CleepbusPeerInfos): void {
    if (this.devices[peerInfos.uuid]) {
      Object.assign(this.devices[peerInfos.uuid], peerInfos);
    } else {
      this.devices[peerInfos.uuid] = peerInfos;
    }
    appSettings.set('devices', this.devices as unknown as SettingsObject);
  }

  private devicesObjectToArray(): CleepbusPeerInfos[] {
    return Object.values(this.devices);
  }

  private deleteDevice(deviceUuid: string): boolean {
    if (!this.devices[deviceUuid]) {
      return false;
    }

    delete this.devices[deviceUuid];
    appSettings.set('devices', this.devices as unknown as SettingsObject);

    sendDataToAngularJs(this.window, 'devices-updated', this.devicesObjectToArray());

    return true;
  }

  private addIpcs(): void {
    ipcMain.handle('devices-delete-device', async (_event, deviceUuid: string) => {
      appLogger.info(`Deleting device ${deviceUuid}`);
      const deviceDeleted = this.deleteDevice(deviceUuid);
      appLogger.info('Device deleted result', { deleted: deviceDeleted });
      return { data: null, error: !deviceDeleted };
    });
  }
}

export const appDevices = new AppDevices();
