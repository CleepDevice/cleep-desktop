export interface CleebusMessageResponse {
  error: boolean;
  message: string;
  data: unknown;
  broadcast?: boolean;
}

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
}

export type CleepbusContentType = 'PEER_CONNECTED' | 'PEER_DISCONNECTED' | 'MESSAGE_RESPONSE';

export interface CleepbusMessage {
  content_type: CleepbusContentType;
  data: unknown;
}
