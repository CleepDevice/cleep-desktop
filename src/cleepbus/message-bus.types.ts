import { CleebusMessageResponse, CleepbusPeerInfos } from './cleepbus.types';

export type OnMessageBusMessageResponseCallback = (
  peerInfos: CleepbusPeerInfos,
  messageResponse: CleebusMessageResponse,
) => void;

export type OnMessageBusPeerConnectedCallback = (peerInfos: CleepbusPeerInfos) => void;

export type OnMessageBusPeerDisconnectedCallback = (peerInfos: CleepbusPeerInfos) => void;

export type OnMessageBusConnectedCallback = (connected: boolean) => void;

export type OnMessageBusErrorCallback = (message: string) => void;
