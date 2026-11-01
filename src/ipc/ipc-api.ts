/**
 * Semantic renderer API — domain methods instead of raw IPC channel strings.
 * Built on top of the typed invoke/send/on primitives from the preload.
 */

import type { IAuthEvent } from '../app-auth';
import type { InstallData } from '../app-iso';
import type { LoggerMessage } from '../app-logger';
import type { NewsCacheIncomingArticle } from '../app-news-cache';
import type { KeyPath, KeyValue, SettingsObject } from '../app-settings';
import type { OpenDialogSyncOptions } from 'electron';
import type {
  InvokeChannel,
  InvokeRequest,
  InvokeResponse,
  ReceiveArgs,
  ReceiveChannel,
  SendChannel,
  SendPayload,
} from './ipc-contract';

export type InvokeArgs<C extends InvokeChannel> = InvokeRequest<C> extends void
  ? []
  : [InvokeRequest<C>];

export type SendArgs<C extends SendChannel> = SendPayload<C> extends void ? [] : [SendPayload<C>];

export type IpcUnsubscribe = () => void;

export type IpcListener<C extends ReceiveChannel> = (
  event: null,
  ...args: ReceiveArgs<C>
) => void;

export type IpcPrimitives = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<InvokeResponse<C>>;
  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void;
  on<C extends ReceiveChannel>(channel: C, listener: IpcListener<C>): IpcUnsubscribe;
};

/** Domain-oriented facade exposed as window.cleep.api */
export function createCleepApi(ipc: IpcPrimitives) {
  return {
    app: {
      getChangelog: () => ipc.invoke('get-changelog'),
      onOpenPage: (listener: IpcListener<'open-page'>) => ipc.on('open-page', listener),
      onOpenModal: (listener: IpcListener<'open-modal'>) => ipc.on('open-modal', listener),
      onAuthError: (listener: IpcListener<'auth-error'>) => ipc.on('auth-error', listener),
    },

    bus: {
      getNetworkConfig: () => ipc.invoke('bus-get-network-config'),
      setNetworkInterface: (interfaceName: string) =>
        ipc.invoke('bus-set-network-interface', interfaceName),
    },

    cache: {
      getInfos: () => ipc.invoke('cache-get-infos'),
      deleteFile: (filename: string) => ipc.invoke('cache-delete-file', filename),
      purgeFiles: () => ipc.invoke('cache-purge-files'),
    },

    news: {
      getCache: () => ipc.invoke('news-cache-get'),
      saveCache: (articles: NewsCacheIncomingArticle[]) => ipc.invoke('news-cache-save', articles),
    },

    devices: {
      getUiState: () => ipc.invoke('devices-get-ui-state'),
      deleteDevice: (deviceUuid: string) => ipc.invoke('devices-delete-device', deviceUuid),
      updateAuth: (auth: IAuthEvent) => ipc.invoke('update-device-auth', auth),
      prepareAuth: (request: { url: string; deviceUuid: string }) =>
        ipc.invoke('devices-prepare-auth', request),
      refreshRemoteUrl: (request: { deviceUuid: string; app?: string }) =>
        ipc.invoke('devices-refresh-remote-url', request),
      bindWebview: (request: {
        webContentsId: number;
        deviceUuid: string;
        gatewayDeviceUuid?: string;
      }) => ipc.invoke('devices-bind-webview', request),
      onUpdated: (listener: IpcListener<'devices-updated'>) => ipc.on('devices-updated', listener),
      onAuthUpdated: (listener: IpcListener<'device-auth-updated'>) =>
        ipc.on('device-auth-updated', listener),
      onBusConnected: (listener: IpcListener<'devices-message-bus-connected'>) =>
        ipc.on('devices-message-bus-connected', listener),
      onBusError: (listener: IpcListener<'devices-message-bus-error'>) =>
        ipc.on('devices-message-bus-error', listener),
      onBusUpdating: (listener: IpcListener<'devices-message-bus-updating'>) =>
        ipc.on('devices-message-bus-updating', listener),
      onMessage: (listener: IpcListener<'devices-message'>) => ipc.on('devices-message', listener),
    },

    download: {
      start: (options: { url: string; title?: string }) => ipc.send('download-file', options),
      cancel: (downloadId: string) => ipc.send('download-file-cancel', downloadId),
      onStarted: (listener: IpcListener<'download-file-started'>) =>
        ipc.on('download-file-started', listener),
      onStatus: (listener: IpcListener<'download-file-status'>) =>
        ipc.on('download-file-status', listener),
    },

    install: {
      getIsos: (force?: boolean) => ipc.invoke('iso-get-isos', force as boolean | void),
      getDrives: () => ipc.invoke('iso-get-drives'),
      hasWifi: () => ipc.invoke('iso-has-wifi'),
      getWifiNetworks: () => ipc.invoke('iso-get-wifi-networks'),
      refreshWifiNetworks: () => ipc.invoke('iso-refresh-wifi-networks'),
      start: (installData: InstallData) => ipc.send('iso-start-install', installData),
      cancel: () => ipc.send('iso-cancel-install'),
      onProgress: (listener: IpcListener<'iso-install-progress'>) =>
        ipc.on('iso-install-progress', listener),
    },

    logger: {
      log: (message: LoggerMessage) => ipc.send('logger-log', message),
      openLogs: () => ipc.send('open-electron-logs'),
      getLogPath: () => ipc.invoke('get-electron-log-path'),
    },

    settings: {
      get: (key: KeyPath) => ipc.invoke('settings-get', key),
      getAll: () => ipc.invoke('settings-get-all'),
      getSelected: (keys: KeyPath[]) => ipc.invoke('settings-get-selected', keys),
      set: (keyValue: KeyValue) => ipc.send('settings-set', keyValue),
      setAll: (settings: SettingsObject) => ipc.invoke('settings-set-all', settings),
      filepath: () => ipc.invoke('settings-filepath'),
      has: (key: KeyPath) => ipc.invoke('settings.has', key),
    },

    shell: {
      openUrl: (url: string) => ipc.send('open-url-in-browser', url),
      openDialog: (options: OpenDialogSyncOptions) => ipc.invoke('open-dialog', options),
    },

    updater: {
      checkForUpdates: () => ipc.invoke('updater-check-for-updates'),
      getSoftwareVersions: () => ipc.invoke('updater-get-software-versions'),
      quitAndInstall: () => ipc.send('updater-quit-and-install'),
      onCleepDesktopAvailable: (listener: IpcListener<'updater-cleepdesktop-update-available'>) =>
        ipc.on('updater-cleepdesktop-update-available', listener),
      onCleepDesktopProgress: (listener: IpcListener<'updater-cleepdesktop-download-progress'>) =>
        ipc.on('updater-cleepdesktop-download-progress', listener),
      onFlashToolAvailable: (listener: IpcListener<'updater-rpi-imager-update-available'>) =>
        ipc.on('updater-rpi-imager-update-available', listener),
      onFlashToolProgress: (listener: IpcListener<'updater-rpi-imager-download-progress'>) =>
        ipc.on('updater-rpi-imager-download-progress', listener),
      onCleepbusAvailable: (listener: IpcListener<'updater-cleepbus-update-available'>) =>
        ipc.on('updater-cleepbus-update-available', listener),
      onCleepbusProgress: (listener: IpcListener<'updater-cleepbus-download-progress'>) =>
        ipc.on('updater-cleepbus-download-progress', listener),
    },

    vault: {
      getStatus: () => ipc.invoke('vault-get-status'),
      enable: (passphrase: string) => ipc.invoke('vault-enable', { passphrase }),
      disable: (passphrase: string) => ipc.invoke('vault-disable', { passphrase }),
      unlock: (passphrase: string) => ipc.invoke('vault-unlock', { passphrase }),
      lock: () => ipc.invoke('vault-lock'),
      dismissUnlock: () => ipc.invoke('vault-dismiss-unlock'),
      notifyUnlockDialogClosed: () => ipc.invoke('vault-unlock-dialog-closed'),
      ensureUnlocked: () => ipc.invoke('vault-ensure-unlocked'),
      changePassphrase: (currentPassphrase: string, nextPassphrase: string) =>
        ipc.invoke('vault-change-passphrase', { currentPassphrase, nextPassphrase }),
      recover: (recoveryCode: string, newPassphrase: string) =>
        ipc.invoke('vault-recover', { recoveryCode, newPassphrase }),
      regenerateRecoveryCodes: (passphrase: string) =>
        ipc.invoke('vault-regenerate-recovery-codes', { passphrase }),
      onUnlockRequired: (listener: IpcListener<'vault-unlock-required'>) =>
        ipc.on('vault-unlock-required', listener),
      onStatusChanged: (listener: IpcListener<'vault-status-changed'>) =>
        ipc.on('vault-status-changed', listener),
    },

    website: {
      getSession: () => ipc.invoke('website-auth-get-session'),
      loadCredentials: () => ipc.invoke('website-auth-load-credentials'),
      login: (email: string, password: string) =>
        ipc.invoke('website-auth-login', { email, password }),
      logout: () => ipc.invoke('website-auth-logout'),
      getApiUrl: () => ipc.invoke('website-auth-get-api-url'),
      onChanged: (listener: IpcListener<'website-auth-changed'>) =>
        ipc.on('website-auth-changed', listener),
    },

    webview: {
      onHttpError: (listener: IpcListener<'webview-http-error'>) =>
        ipc.on('webview-http-error', listener),
      onNewWindow: (listener: IpcListener<'webview-new-window'>) =>
        ipc.on('webview-new-window', listener),
    },
  };
}

export type CleepApi = ReturnType<typeof createCleepApi>;
