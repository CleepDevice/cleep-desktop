export interface CleebusMessageResponse {
  event?: string;
  command?: string;
  to?: string;
  params: unknown;
  startup: boolean;
  device_id?: string;
  sender: string;
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
  auth?: boolean;
}

export type CleepbusContentType = 'PEER_CONNECTED' | 'PEER_DISCONNECTED' | 'MESSAGE_RESPONSE';

export interface CleepbusMessage {
  content_type: CleepbusContentType;
  peer_infos: CleepbusPeerInfos;
  data?: unknown;
}

export const TEST_DEVICE = {
  uuid: 'c0c21c95-24fc-4046-a436-c6aa93dc6947',
  ident: '4d262d7b-ba1a-4a9c-80cb-58e79086e62f',
  hostname: 'TESTDEVICE',
  ip: '127.0.0.1',
  port: 9000,
  ssl: false,
  macs: ['b8:27:eb:13:14:9f'],
  cleepdesktop: false,
  online: true,
  extra: {
    version: '0.0.29',
    apps: [
      'alarmclock',
      'audio',
      'audioplayer',
      'cleepbus',
      'fourletterdisplay',
      'localmusic',
      'network',
      'parameters',
      'system',
      'update',
    ],
    hwmodel: '3 Model B',
    pcbrevision: 1.2,
    hwmemory: '1 GB',
    hwaudio: 1,
    hwwireless: 1,
    hwethernet: 1,
    hwrevision: 'a02082',
    connectedat: 1660891978,
    configured: true,
  },
};
