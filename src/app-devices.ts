import { BrowserWindow } from 'electron';
import { appAuth } from './app-auth';
import { appLogger } from './app-logger';
import { appSettings, SettingsObject } from './app-settings';
import { cleepbus } from './cleepbus/cleepbus';
import { listNetworkInterfaces, selectInterface } from './pyre/iface';
import { CleebusMessageResponse, CleepbusPeerInfos, TEST_DEVICE } from './cleepbus/cleepbus.types';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';
import { appContext } from './app-context';

class AppDevices {
  private window: BrowserWindow;
  private devices: Record<string, CleepbusPeerInfos> = {};
  private busConnected = false;

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
    this.addIpcs();
  }

  private loadDevicesFromSettings(): void {
    const devices = appSettings.get('devices');
    Object.assign(this.devices, devices);

    // set all devices not online and wait for message bus peer connection to set online
    for (const device of Object.values(this.devices)) {
      device.online = false;
    }

    if (appContext.isDev) {
      this.devices[TEST_DEVICE.uuid] = TEST_DEVICE;
    }
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    cleepbus.start();
  }

  public stop(): void {
    cleepbus.stop();
  }

  private onMessageBusError(error: string): void {
    appLogger.error('Message bus error', { error });
    this.busConnected = false;
    this.markAllDevicesOffline();
    sendToRenderer(this.window, 'devices-message-bus-error', error);
  }

  private onMessageBusConnected(connected: boolean): void {
    appLogger.info('Message bus connected', { connected });
    this.busConnected = connected;
    if (!connected) {
      this.markAllDevicesOffline();
    }
    sendToRenderer(this.window, 'devices-message-bus-connected', connected);
  }

  private markAllDevicesOffline(): void {
    for (const device of Object.values(this.devices)) {
      device.online = false;
    }
    appSettings.set('devices', this.devices as unknown as SettingsObject);
    this.emitDevicesUpdated();
  }

  private onMessageBusUpdating(updating: boolean): void {
    appLogger.info('Message bus updating', { updating });
    sendToRenderer(this.window, 'devices-message-bus-updating', updating);
  }

  private onMessageResponse(peerInfos: CleepbusPeerInfos, messageResponse: CleebusMessageResponse): void {
    appLogger.debug('Received message response from Cleepbus', { peerInfos, messageResponse });
    const timestamp = Math.round(new Date().getTime() / 1000);
    sendToRenderer(this.window, 'devices-message', { timestamp, peerInfos, message: messageResponse });
  }

  private onPeerDisconnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer disconnected', { peerInfos });
    peerInfos.online = false;
    this.updateDevices(peerInfos);
    this.emitDevicesUpdated();
    this.emitPeerLifecycleMessage(peerInfos, 'device.disconnected');
  }

  private onPeerConnected(peerInfos: CleepbusPeerInfos): void {
    appLogger.info('Peer connected', { uuid: peerInfos.uuid });
    peerInfos.online = true;
    this.updateDevices(peerInfos);
    this.emitDevicesUpdated();
    this.emitPeerLifecycleMessage(peerInfos, 'device.connected');
  }

  private emitDevicesUpdated(): void {
    if (!this.window || this.window.isDestroyed?.()) {
      return;
    }
    sendToRenderer(this.window, 'devices-updated', this.devicesForRenderer());
  }

  /** Publish connect/disconnect into the monitoring feed (same channel as device events). */
  private emitPeerLifecycleMessage(
    peerInfos: CleepbusPeerInfos,
    event: 'device.connected' | 'device.disconnected',
  ): void {
    if (!this.window || this.window.isDestroyed?.()) {
      return;
    }
    const timestamp = Math.round(Date.now() / 1000);
    const message: CleebusMessageResponse = {
      event,
      sender: peerInfos.hostname || 'unknown',
      startup: false,
      params: {
        ip: peerInfos.ip,
        online: event === 'device.connected',
        port: peerInfos.port,
      },
    };
    sendToRenderer(this.window, 'devices-message', { timestamp, peerInfos, message });
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

  /** Devices payload for the renderer, including vault/session auth flags. */
  private devicesForRenderer(): Array<CleepbusPeerInfos & { hasAuthStored: boolean }> {
    return this.devicesObjectToArray().map((device) => ({
      ...device,
      hasAuthStored: appAuth.hasStoredAuth(device.uuid),
    }));
  }

  /** Lookup a known device by IP / hostname (HTTP auth host). */
  public findByHost(host: string): CleepbusPeerInfos | undefined {
    const needle = (host || '').trim().toLowerCase();
    if (!needle) {
      return undefined;
    }
    return Object.values(this.devices).find((device) => {
      const ip = (device.ip || '').toLowerCase();
      const hostname = (device.hostname || '').toLowerCase();
      return ip === needle || hostname === needle;
    });
  }

  private deleteDevice(deviceUuid: string): boolean {
    if (!this.devices[deviceUuid]) {
      return false;
    }

    delete this.devices[deviceUuid];
    appSettings.set('devices', this.devices as unknown as SettingsObject);

    this.emitDevicesUpdated();

    return true;
  }

  private getNetworkConfigState() {
    const selectedInterface = appSettings.get<string>('cleep.networkinterface') || '';
    const forcedName = selectedInterface.trim() || undefined;
    let activeInterface: { name: string; address: string } | null = null;
    try {
      const active = selectInterface(forcedName);
      activeInterface = { name: active.name, address: active.address };
    } catch (error) {
      appLogger.warn('Unable to resolve active network interface for UI', { error, forcedName });
    }
    return {
      selectedInterface,
      activeInterface,
      interfaces: listNetworkInterfaces(),
      peerCount: cleepbus.getBusStats().peers,
      busConnected: this.busConnected,
    };
  }

  private addIpcs(): void {
    handleInvoke('devices-get-ui-state', async () =>
      ipcOk({
        devices: this.devicesForRenderer(),
        busConnected: this.busConnected,
      }),
    );

    handleInvoke('bus-get-network-config', async () => ipcOk(this.getNetworkConfigState()));

    handleInvoke('bus-set-network-interface', async (_event, interfaceName) => {
      const name = typeof interfaceName === 'string' ? interfaceName.trim() : '';
      appSettings.set('cleep.networkinterface', name);
      appLogger.info('Network interface preference updated, restarting message bus', { interfaceName: name || '(automatic)' });
      this.markAllDevicesOffline();
      await cleepbus.restart();
      return ipcOk(this.getNetworkConfigState());
    });

    handleInvoke('devices-delete-device', async (_event, deviceUuid) => {
      appLogger.info(`Deleting device ${deviceUuid}`);
      const deviceDeleted = this.deleteDevice(deviceUuid);
      appLogger.info('Device deleted result', { deleted: deviceDeleted });
      if (!deviceDeleted) {
        return ipcErr('DEVICE_NOT_FOUND', `Device ${deviceUuid} was not found`);
      }
      return ipcOk(null);
    });
  }
}

export const appDevices = new AppDevices();
