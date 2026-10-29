export interface CleebusMessageResponse {
  event?: string;
  command?: string;
  to?: string;
  params: unknown;
  startup: boolean;
  device_id?: string;
  sender: string;
  command_uuid?: string;
}

/** Provider call description for off-LAN remote URL refresh (no secret). */
export type RemoteUrlRefreshDescriptor = {
  version: number;
  method: string;
  url: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  extract?: { list?: string; url?: string };
};

/** Per-app refresh capability cached on the device (secret lives in the vault). */
export type RemoteUrlRefreshEntry =
  | { supported: false }
  | { supported: true; descriptor: RemoteUrlRefreshDescriptor };

export interface CleepbusPeerInfos {
  uuid: string;
  ident?: string;
  hostname: string;
  ip: string;
  port?: number;
  ssl?: boolean;
  macs: string[];
  cleepdesktop: boolean;
  online: boolean;
  extra?: Record<string, unknown>;
  auth?: boolean;
  /** Public URLs keyed by application name (from ZRE header). */
  remoteaccess?: Record<string, string>;
  /** Remote URL refresh descriptors keyed by application name. */
  remoteRefresh?: Record<string, RemoteUrlRefreshEntry>;
}

/** Default hostname before the user renames the device in parameters. */
export const UNCONFIGURED_DEVICE_HOSTNAME = 'cleepdevice';

export type CleepbusContentType = 'PEER_CONNECTED' | 'PEER_DISCONNECTED' | 'MESSAGE_RESPONSE';

export interface CleepbusMessage {
  content_type: CleepbusContentType;
  peer_infos: CleepbusPeerInfos;
  data?: unknown;
}
