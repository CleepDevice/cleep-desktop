import { BrowserWindow, ipcMain } from 'electron';
import { appLogger } from './app-logger';
import { appSettings, SettingsObject } from './app-settings';
import { cleepbus } from './cleepbus/cleepbus';
import { CleebusMessageResponse, CleepbusPeerInfos } from './cleepbus/cleepbus.types';

class AppDevices {
  private window: BrowserWindow;
  private devices: Record<string, CleepbusPeerInfos> = {};

  constructor() {
    cleepbus.setCleepbusCallbacks(
      this.onMessageBusError.bind(this),
      this.onMessageBusConnected.bind(this),
      this.onMessageResponse.bind(this),
      this.onPeerConnected.bind(this),
      this.onPeerDisconnected.bind(this),
    );

    this.loadDevicesFromSettings();
  }

  private loadDevicesFromSettings(): void {
    Object.assign(this.devices, appSettings.get('devices'));

    // set all devices not online and wait for message bus peer connection to set online
    for (const device of Object.values(this.devices)) {
      device.online = false;
    }
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    this.addIpcs();

    // send devices list at startup
    this.window.webContents.once('dom-ready', () => {
      this.sendToAngularJs('devices-updated', this.devicesObjectToArray());
    });

    cleepbus.start();
  }

  public stop(): void {
    cleepbus.stop();
  }

  private onMessageBusError(error: string): void {
    appLogger.error('Message bus error', { error });
    this.sendToAngularJs('devices-message-bus-error', error);
  }

  private onMessageBusConnected(connected: boolean): void {
    appLogger.info('Message bus connected', { connected });
    this.sendToAngularJs('devices-message-bus-connected', connected);
  }

  private onMessageResponse(messageResponse: CleebusMessageResponse): void {
    // TODO handle message response
    appLogger.info('Received message response from Cleepbus', { messageResponse });
  }

  private onPeerDisconnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer disconnected', { peerInfos });
    this.updateDevices(peerInfos);
    this.sendToAngularJs('devices-updated', this.devicesObjectToArray());
  }

  private onPeerConnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer connected', { uuid: peerInfos.uuid });
    this.updateDevices(peerInfos);
    this.sendToAngularJs('devices-updated', this.devicesObjectToArray());
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

    this.sendToAngularJs('devices-updated', this.devicesObjectToArray());

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

  private sendToAngularJs(event: string, data: unknown): void {
    try {
      this.window.webContents.send(event, data);
    } catch {
      appLogger.debug('Could appear when trying to access window when stopping application');
    }
  }
}

export const appDevices = new AppDevices();