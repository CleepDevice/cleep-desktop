/**
 * Typed IPC contract: single source of truth for channel names + payloads.
 *
 * - Invoke: renderer → main via ipcRenderer.invoke (request/response)
 * - Send: renderer → main via ipcRenderer.send (fire-and-forget)
 * - Receive: main → renderer via webContents.send (push)
 *
 * Runtime allowlists in ipc-channels.ts are checked against these maps at compile time.
 */

import type { OpenDialogSyncOptions } from 'electron';
import type { IAuthEvent } from '../app-auth';
import type { CachedFileInfos } from '../app-cache';
import type { InstallData } from '../app-iso';
import type { LoggerMessage } from '../app-logger';
import type { KeyPath, KeyValue, SettingsObject, SettingsValue } from '../app-settings';
import type { UpdateData, UpdateStatus } from '../app-updater';
import type { CleebusMessageResponse, CleepbusPeerInfos } from '../cleepbus/cleepbus.types';
import type { Drive } from '../flash-tool/flashtool.interface';
import type { RaspiosLatestRelease } from '../iso/raspios';
import type { IIsoReleaseInfo } from '../iso/utils';
import type { WifiNetwork } from '../iso/wifi';
import type { ListedNetworkInterface } from '../pyre/iface';
import type { IpcResult } from './ipc-result';

export type DevicesUiState = {
  devices: CleepbusPeerInfos[];
  busConnected: boolean;
};

export type NetworkConfigState = {
  selectedInterface: string;
  activeInterface: { name: string; address: string } | null;
  interfaces: ListedNetworkInterface[];
  peerCount: number;
  busConnected: boolean;
};

export type SoftwareVersions = {
  lastUpdateCheck: number;
  cleepDesktop: string;
  flashTool: string | null;
  cleepbus: string | null;
};

export type InstallProgressPayload = {
  percent?: number;
  eta?: number;
  step?: 'idle' | 'downloading' | 'privileges' | 'flashing' | 'validating' | 'canceled';
  error?: string;
  terminated?: boolean;
};

export type DeviceAuthUpdatedPayload = {
  deviceUuid: string;
  hasAuthStored: boolean;
};

export type AuthErrorPayload = {
  ip: string;
  errorCode: string;
};

export type DevicesMessagePayload = {
  timestamp: number;
  peerInfos: CleepbusPeerInfos;
  message: CleebusMessageResponse;
};

export type DownloadStartedPayload = {
  downloadId: string;
  filename: string;
  url: string;
};

export type DownloadStatusPayload = {
  downloadId: string;
  filename: string;
  status: 'downloading' | 'canceled' | 'success' | 'failed';
  percent: number;
};

export type OpenPagePayload = {
  page: string;
};

export type OpenModalPayload = {
  controller: string;
  template: string;
};

/** Subset of Electron.HandlerDetails used by the device webview bridge. */
export type WebviewOpenDetails = {
  url: string;
};

export type IsoReleasesPayload = {
  raspios?: RaspiosLatestRelease;
  cleepos?: IIsoReleaseInfo;
};

export type CacheInfosPayload = {
  files?: CachedFileInfos[];
  dir?: string;
};

export type IsoDrivesPayload = {
  drives: Drive[];
  flashToolInstalled: boolean;
};

/**
 * invoke(channel, request?) → Promise<IpcResult<data>>
 * Use `request: void` when the renderer calls invoke with no payload.
 * Every response uses the uniform envelope from ipc-result.ts.
 */
export type InvokeContract = {
  'bus-get-network-config': { request: void; response: IpcResult<NetworkConfigState> };
  'bus-set-network-interface': { request: string; response: IpcResult<NetworkConfigState> };
  'cache-delete-file': { request: string; response: IpcResult<boolean> };
  'cache-get-infos': { request: void; response: IpcResult<CacheInfosPayload> };
  'cache-purge-files': { request: void; response: IpcResult<boolean> };
  'devices-delete-device': { request: string; response: IpcResult<null> };
  'devices-get-ui-state': { request: void; response: IpcResult<DevicesUiState> };
  'get-changelog': { request: void; response: IpcResult<string> };
  'get-electron-log-path': { request: void; response: IpcResult<string> };
  'iso-get-drives': { request: void; response: IpcResult<IsoDrivesPayload> };
  'iso-get-isos': { request: boolean | void; response: IpcResult<IsoReleasesPayload> };
  'iso-get-wifi-networks': { request: void; response: IpcResult<WifiNetwork[]> };
  'iso-has-wifi': { request: void; response: IpcResult<boolean> };
  'iso-refresh-wifi-networks': { request: void; response: IpcResult<WifiNetwork[]> };
  'open-dialog': { request: OpenDialogSyncOptions; response: IpcResult<string[]> };
  'settings-filepath': { request: void; response: IpcResult<string> };
  'settings-get': { request: KeyPath; response: IpcResult<SettingsValue> };
  'settings-get-all': { request: void; response: IpcResult<SettingsObject> };
  'settings-get-selected': { request: KeyPath[]; response: IpcResult<Record<string, unknown>> };
  'settings-set-all': { request: SettingsObject; response: IpcResult<true> };
  'settings.has': { request: KeyPath; response: IpcResult<boolean> };
  'update-device-auth': { request: IAuthEvent; response: IpcResult<true> };
  'updater-check-for-updates': { request: void; response: IpcResult<UpdateStatus> };
  'updater-get-software-versions': { request: void; response: IpcResult<SoftwareVersions> };
};

/** send(channel, payload?) — fire-and-forget renderer → main */
export type SendContract = {
  'download-file': { payload: { url: string; title?: string } };
  'download-file-cancel': { payload: string };
  'iso-cancel-install': { payload: void };
  'iso-start-install': { payload: InstallData };
  'logger-log': { payload: LoggerMessage };
  'open-electron-logs': { payload: void };
  'open-url-in-browser': { payload: string };
  'settings-set': { payload: KeyValue };
  'updater-quit-and-install': { payload: void };
};

/**
 * webContents.send(channel, ...args) — main → renderer.
 * `args` is a tuple matching the sent arguments (usually one payload).
 */
export type ReceiveContract = {
  'auth-error': { args: [AuthErrorPayload] };
  'device-auth-updated': { args: [DeviceAuthUpdatedPayload] };
  'devices-message': { args: [DevicesMessagePayload] };
  'devices-message-bus-connected': { args: [boolean] };
  'devices-message-bus-error': { args: [string] };
  'devices-message-bus-updating': { args: [boolean] };
  'devices-updated': { args: [CleepbusPeerInfos[]] };
  'download-file-started': { args: [DownloadStartedPayload] };
  'download-file-status': { args: [DownloadStatusPayload] };
  'iso-install-progress': { args: [InstallProgressPayload] };
  'open-modal': { args: [OpenModalPayload] };
  'open-page': { args: [OpenPagePayload] };
  'updater-cleepbus-download-progress': { args: [UpdateData] };
  'updater-cleepbus-update-available': { args: [UpdateData] };
  'updater-cleepdesktop-download-progress': { args: [UpdateData] };
  'updater-cleepdesktop-update-available': { args: [UpdateData] };
  'updater-rpi-imager-download-progress': { args: [UpdateData] };
  'updater-rpi-imager-update-available': { args: [UpdateData] };
  'webview-new-window': { args: [webContentsId: number, details: WebviewOpenDetails] };
};

export type InvokeChannel = keyof InvokeContract;
export type SendChannel = keyof SendContract;
export type ReceiveChannel = keyof ReceiveContract;

export type InvokeRequest<C extends InvokeChannel> = InvokeContract[C]['request'];
export type InvokeResponse<C extends InvokeChannel> = InvokeContract[C]['response'];
export type SendPayload<C extends SendChannel> = SendContract[C]['payload'];
export type ReceiveArgs<C extends ReceiveChannel> = ReceiveContract[C]['args'];
