import type { InvokeChannel, ReceiveChannel, SendChannel } from './ipc-contract';

/**
 * Runtime allowlists for the preload bridge.
 * Kept in sync with InvokeContract / SendContract / ReceiveContract via satisfies + exhaustiveness checks.
 */

export const INVOKE_CHANNELS = [
  'bus-get-network-config',
  'bus-set-network-interface',
  'cache-delete-file',
  'cache-get-infos',
  'cache-purge-files',
  'devices-delete-device',
  'devices-get-ui-state',
  'get-changelog',
  'get-electron-log-path',
  'iso-get-drives',
  'iso-get-isos',
  'iso-get-wifi-networks',
  'iso-has-wifi',
  'iso-refresh-wifi-networks',
  'open-dialog',
  'settings-filepath',
  'settings-get',
  'settings-get-all',
  'settings-get-selected',
  'settings-set-all',
  'settings.has',
  'update-device-auth',
  'updater-check-for-updates',
  'updater-get-software-versions',
] as const satisfies readonly InvokeChannel[];

export const SEND_CHANNELS = [
  'download-file',
  'download-file-cancel',
  'iso-cancel-install',
  'iso-start-install',
  'logger-log',
  'open-electron-logs',
  'open-url-in-browser',
  'settings-set',
  'updater-quit-and-install',
] as const satisfies readonly SendChannel[];

export const RECEIVE_CHANNELS = [
  'auth-error',
  'device-auth-updated',
  'devices-message',
  'devices-message-bus-connected',
  'devices-message-bus-error',
  'devices-message-bus-updating',
  'devices-updated',
  'download-file-started',
  'download-file-status',
  'iso-install-progress',
  'open-modal',
  'open-page',
  'updater-cleepbus-download-progress',
  'updater-cleepbus-update-available',
  'updater-cleepdesktop-download-progress',
  'updater-cleepdesktop-update-available',
  'updater-rpi-imager-download-progress',
  'updater-rpi-imager-update-available',
  'webview-new-window',
] as const satisfies readonly ReceiveChannel[];

/** Fail compilation if a contract key is missing from the runtime allowlist. */
type AssertExhaustive<Contract, List extends readonly string[]> =
  Exclude<keyof Contract, List[number]> extends never ? true : Exclude<keyof Contract, List[number]>;

const _invokeExhaustive: AssertExhaustive<
  import('./ipc-contract').InvokeContract,
  typeof INVOKE_CHANNELS
> = true;
const _sendExhaustive: AssertExhaustive<import('./ipc-contract').SendContract, typeof SEND_CHANNELS> =
  true;
const _receiveExhaustive: AssertExhaustive<
  import('./ipc-contract').ReceiveContract,
  typeof RECEIVE_CHANNELS
> = true;

void _invokeExhaustive;
void _sendExhaustive;
void _receiveExhaustive;

function includesChannel(channels: readonly string[], channel: string): boolean {
  return channels.includes(channel);
}

export function assertInvokeChannel(channel: string): asserts channel is InvokeChannel {
  if (!includesChannel(INVOKE_CHANNELS, channel)) {
    throw new Error(`Blocked IPC invoke channel: ${channel}`);
  }
}

export function assertSendChannel(channel: string): asserts channel is SendChannel {
  if (!includesChannel(SEND_CHANNELS, channel)) {
    throw new Error(`Blocked IPC send channel: ${channel}`);
  }
}

export function assertReceiveChannel(channel: string): asserts channel is ReceiveChannel {
  if (!includesChannel(RECEIVE_CHANNELS, channel)) {
    throw new Error(`Blocked IPC receive channel: ${channel}`);
  }
}

export type { InvokeChannel, ReceiveChannel, SendChannel } from './ipc-contract';
