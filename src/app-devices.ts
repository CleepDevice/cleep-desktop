import { BrowserWindow } from 'electron';
import { appAuth } from './app-auth';
import { appLogger } from './app-logger';
import { appSettings, SettingsObject } from './app-settings';
import { cleepbus } from './cleepbus/cleepbus';
import { listNetworkInterfaces, selectInterface } from './pyre/iface';
import { CleebusMessageResponse, CleepbusPeerInfos } from './cleepbus/cleepbus.types';
import { macListsOverlap } from './cleepbus/mac-addresses';
import { handleInvoke, ipcErr, ipcOk, sendToRenderer } from './ipc/ipc-main';
import {
  executeRemoteUrlRefresh,
  parseRemoteUrlRefreshPayload,
  readRemoteRefreshSecret,
  storeRemoteRefreshSecret,
} from './remote-url-refresh';
import { parseGatewayAccess, readGatewayAccess, storeGatewayAccess } from './gateway-access';
import { bindGatewayWebview, unbindGatewayWebview } from './utils/gateway';

function normalizeRemoteAccessUrls(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
    ),
  );
}

type DevicesMessagePayload = {
  timestamp: number;
  peerInfos: CleepbusPeerInfos;
  message: CleebusMessageResponse;
};

class AppDevices {
  private window: BrowserWindow;
  private devices: Record<string, CleepbusPeerInfos> = {};
  private busConnected = false;
  /** False until the renderer has registered IPC listeners (signaled by getUiState). */
  private rendererReady = false;
  /** Peer connect/disconnect events received before the monitoring UI is listening. */
  private pendingLifecycleMessages: DevicesMessagePayload[] = [];
  private static readonly MAX_PENDING_LIFECYCLE_MESSAGES = 50;

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
  }

  public configure(window: BrowserWindow): void {
    this.window = window;
    // Bus can discover peers before Angular has subscribed to devices-message.
    this.rendererReady = false;
    this.pendingLifecycleMessages = [];
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
    if (messageResponse?.event === 'core.remoteaccess.update') {
      this.applyRemoteAccessUpdate(peerInfos, messageResponse);
    }
    const timestamp = Math.round(new Date().getTime() / 1000);
    this.sendDevicesMessage({ timestamp, peerInfos, message: messageResponse });
  }

  /**
   * Force-update a peer's remoteaccess map from a live bus event (no reconnection needed).
   */
  private applyRemoteAccessUpdate(
    peerInfos: CleepbusPeerInfos,
    messageResponse: CleebusMessageResponse,
  ): void {
    const uuid = peerInfos?.uuid;
    if (!uuid) {
      appLogger.warn('Ignoring remoteaccess update without peer uuid', { messageResponse });
      return;
    }

    const params = messageResponse.params as { urls?: unknown; peers?: unknown } | undefined;
    const urls = normalizeRemoteAccessUrls(params?.urls);
    const existing = this.devices[uuid];
    if (existing) {
      existing.remoteaccess = urls;
      appSettings.set('devices', this.devices as unknown as SettingsObject);
    } else {
      this.updateDevices({
        ...peerInfos,
        remoteaccess: urls,
        online: peerInfos.online ?? true,
      });
    }
    this.mergeGatewayPeers(params?.peers);
    appLogger.info('Peer remoteaccess updated', { uuid, urls });
    this.emitDevicesUpdated();
    void this.fetchRemoteRefreshDescriptors(uuid);
  }

  /** Merge gateway catalogue peers into the device list (offline until seen on bus). */
  private mergeGatewayPeers(raw: unknown): void {
    if (!Array.isArray(raw)) {
      return;
    }
    let changed = false;
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const peer = entry as Record<string, unknown>;
      const peerUuid = typeof peer.uuid === 'string' ? peer.uuid : '';
      if (!peerUuid || this.devices[peerUuid]) {
        continue;
      }
      this.devices[peerUuid] = {
        uuid: peerUuid,
        hostname: typeof peer.hostname === 'string' ? peer.hostname : peerUuid,
        ip: typeof peer.ip === 'string' ? peer.ip : '',
        port: typeof peer.port === 'number' ? peer.port : 443,
        ssl: Boolean(peer.ssl),
        auth: Boolean(peer.auth),
        macs: [],
        cleepdesktop: false,
        online: false,
        remoteaccess: {},
      };
      changed = true;
    }
    if (changed) {
      appSettings.set('devices', this.devices as unknown as SettingsObject);
    }
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
    void this.fetchRemoteRefreshDescriptors(peerInfos.uuid);
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
    const timestamp = Math.round(Date.now() / 1000);
    const payload: DevicesMessagePayload = {
      timestamp,
      peerInfos,
      message: {
        event,
        sender: peerInfos.hostname || 'unknown',
        startup: false,
        params: {
          ip: peerInfos.ip,
          online: event === 'device.connected',
          port: peerInfos.port,
        },
      },
    };

    if (!this.rendererReady) {
      this.pendingLifecycleMessages.push(payload);
      if (this.pendingLifecycleMessages.length > AppDevices.MAX_PENDING_LIFECYCLE_MESSAGES) {
        this.pendingLifecycleMessages.shift();
      }
      return;
    }

    this.sendDevicesMessage(payload);
  }

  private sendDevicesMessage(payload: DevicesMessagePayload): void {
    if (!this.window || this.window.isDestroyed?.()) {
      return;
    }
    sendToRenderer(this.window, 'devices-message', payload);
  }

  /**
   * Mark the renderer as ready and flush peer lifecycle events buffered during startup.
   * Called from devices-get-ui-state (after monitoringService.init registers its listener).
   */
  private flushPendingLifecycleMessages(): void {
    this.rendererReady = true;
    if (this.pendingLifecycleMessages.length === 0) {
      return;
    }
    const pending = this.pendingLifecycleMessages;
    this.pendingLifecycleMessages = [];
    for (const payload of pending) {
      this.sendDevicesMessage(payload);
    }
  }

  private updateDevices(peerInfos: CleepbusPeerInfos): void {
    if (!peerInfos?.uuid) {
      return;
    }

    if (this.devices[peerInfos.uuid]) {
      Object.assign(this.devices[peerInfos.uuid], peerInfos);
    } else {
      // Same physical device can change instance uuid (core regen / reinstall).
      // Match on MAC like cleepbus does, then rebind the saved entry.
      const previousUuid = this.findDeviceUuidByMacs(peerInfos.macs);
      if (previousUuid && previousUuid !== peerInfos.uuid) {
        const previous = this.devices[previousUuid];
        delete this.devices[previousUuid];
        const previousRemote = previous?.remoteaccess || {};
        const nextRemote = peerInfos.remoteaccess || {};
        this.devices[peerInfos.uuid] = {
          ...previous,
          ...peerInfos,
          remoteaccess:
            Object.keys(nextRemote).length > 0 ? nextRemote : previousRemote,
        };
        appAuth.rebindDeviceUuid(previousUuid, peerInfos.uuid);
        appLogger.info('Rebound saved device to new uuid (MAC match)', {
          previousUuid,
          nextUuid: peerInfos.uuid,
          hostname: peerInfos.hostname,
        });
      } else {
        this.devices[peerInfos.uuid] = peerInfos;
      }
    }
    appSettings.set('devices', this.devices as unknown as SettingsObject);
  }

  private findDeviceUuidByMacs(macs: string[] | undefined): string | undefined {
    if (!macs?.length) {
      return undefined;
    }
    return Object.keys(this.devices).find((uuid) => macListsOverlap(this.devices[uuid]?.macs, macs));
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

  public getDevice(deviceUuid: string): CleepbusPeerInfos | undefined {
    return this.devices[deviceUuid];
  }

  /** Lookup a known device by IP / hostname / remote-access host (HTTP auth host). */
  public findByHost(host: string): CleepbusPeerInfos | undefined {
    const needle = (host || '').trim().toLowerCase();
    if (!needle) {
      return undefined;
    }
    return Object.values(this.devices).find((device) => {
      const ip = (device.ip || '').toLowerCase();
      const hostname = (device.hostname || '').toLowerCase();
      if (ip === needle || hostname === needle) {
        return true;
      }
      const remote = device.remoteaccess || {};
      return Object.values(remote).some((remoteUrl) => {
        try {
          return new URL(remoteUrl).hostname.toLowerCase() === needle;
        } catch {
          return false;
        }
      });
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

  /**
   * Ask each remote-access app on the device for its refresh descriptor (LAN only).
   */
  private async fetchRemoteRefreshDescriptors(deviceUuid: string): Promise<void> {
    const device = this.devices[deviceUuid];
    if (!device?.online || !device.ident) {
      appLogger.debug('Skip remote URL refresh fetch (device offline or missing ident)', {
        deviceUuid,
        online: device?.online,
        hasIdent: Boolean(device?.ident),
      });
      return;
    }
    const apps = Object.keys(device.remoteaccess || {});
    if (apps.length === 0) {
      appLogger.debug('Skip remote URL refresh fetch (no remoteaccess apps)', { deviceUuid });
      return;
    }

    appLogger.info('Fetching remote URL refresh descriptors', { deviceUuid, apps });
    let changed = false;
    const remoteRefresh = { ...(device.remoteRefresh || {}) };
    for (const app of apps) {
      try {
        const data = await cleepbus.sendCommandToPeer(
          device.ident,
          'get_remote_url_refresh',
          app,
          {},
          8,
        );
        const parsed = parseRemoteUrlRefreshPayload(data);
        if (!parsed) {
          appLogger.warn('Invalid get_remote_url_refresh payload', { deviceUuid, app });
          continue;
        }
        if (parsed.entry.supported && parsed.secret) {
          await storeRemoteRefreshSecret(deviceUuid, app, parsed.secret);
        }
        const gateway = parseGatewayAccess({ gateway: parsed.gateway });
        if (gateway) {
          await storeGatewayAccess(deviceUuid, app, gateway);
          appLogger.info('Gateway access token cached', { deviceUuid, app });
        }
        remoteRefresh[app] = parsed.entry;
        changed = true;
        appLogger.info('Remote URL refresh descriptor cached', {
          deviceUuid,
          app,
          supported: parsed.entry.supported,
        });
      } catch (error) {
        appLogger.warn('Unable to fetch remote URL refresh descriptor', {
          deviceUuid,
          app,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!changed) {
      return;
    }
    device.remoteRefresh = remoteRefresh;
    appSettings.set('devices', this.devices as unknown as SettingsObject);
    this.emitDevicesUpdated();
  }

  /**
   * Re-resolve a public URL via the provider API using the cached descriptor + vault secret.
   * When the device is online on LAN, re-fetch the descriptor first so module updates apply.
   */
  public async refreshRemoteUrl(deviceUuid: string, app?: string): Promise<string> {
    const device = this.devices[deviceUuid];
    if (!device) {
      throw new Error('Device not found');
    }
    if (device.online && device.ident) {
      await this.fetchRemoteRefreshDescriptors(deviceUuid);
    }
    const remote = device.remoteaccess || {};
    const apps = app ? [app] : Object.keys(remote);
    if (apps.length === 0) {
      throw new Error('No remote access URL on this device');
    }

    let lastError: Error | null = null;
    for (const appName of apps) {
      const entry = this.devices[deviceUuid]?.remoteRefresh?.[appName];
      if (!entry?.supported) {
        lastError = new Error(`Remote URL refresh is not supported for ${appName}`);
        continue;
      }
      try {
        const secret = await readRemoteRefreshSecret(deviceUuid, appName);
        if (!secret) {
          throw new Error('Refresh secret is missing from the vault');
        }
        const publicUrl = await executeRemoteUrlRefresh(entry.descriptor, secret);
        device.remoteaccess = {
          ...(device.remoteaccess || {}),
          [appName]: publicUrl,
        };
        appSettings.set('devices', this.devices as unknown as SettingsObject);
        this.emitDevicesUpdated();
        return publicUrl;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        appLogger.warn('Remote URL refresh failed', { deviceUuid, app: appName, error: lastError });
      }
    }
    throw lastError || new Error('Unable to refresh remote URL');
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
    handleInvoke('devices-get-ui-state', async () => {
      // Renderer has attached IPC listeners (monitoring before devices in app.js).
      this.flushPendingLifecycleMessages();
      return ipcOk({
        devices: this.devicesForRenderer(),
        busConnected: this.busConnected,
      });
    });

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

    handleInvoke('devices-refresh-remote-url', async (_event, request) => {
      try {
        const publicUrl = await this.refreshRemoteUrl(request.deviceUuid, request.app);
        return ipcOk({ publicUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return ipcErr('REMOTE_URL_REFRESH_FAILED', message);
      }
    });

    handleInvoke('devices-bind-webview', async (_event, request) => {
      const { webContentsId, deviceUuid, gatewayDeviceUuid } = request;
      if (gatewayDeviceUuid) {
        const access = await readGatewayAccess(gatewayDeviceUuid);
        if (access?.token) {
          bindGatewayWebview(webContentsId, {
            deviceUuid,
            gatewayDeviceUuid,
            gatewayToken: access.token,
          });
          return ipcOk(null);
        }
        appLogger.warn('No gateway token in vault for bind-webview', { gatewayDeviceUuid });
      }
      unbindGatewayWebview(webContentsId);
      return ipcOk(null);
    });
  }

  /** First cached device that advertises a public remoteaccess URL (house gateway). */
  public findGatewayDevice(): CleepbusPeerInfos | undefined {
    return Object.values(this.devices).find((device) => {
      const remote = device.remoteaccess || {};
      return Object.values(remote).some((url) => typeof url === 'string' && url.startsWith('https://'));
    });
  }
}

export const appDevices = new AppDevices();
