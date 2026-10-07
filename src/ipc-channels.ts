/**
 * IPC channel allowlists for the preload bridge.
 * Renderer code may only invoke/send/listen on these names.
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
] as const;

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
] as const;

/** Main → renderer push channels the UI may subscribe to. */
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
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
export type SendChannel = (typeof SEND_CHANNELS)[number];
export type ReceiveChannel = (typeof RECEIVE_CHANNELS)[number];

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
