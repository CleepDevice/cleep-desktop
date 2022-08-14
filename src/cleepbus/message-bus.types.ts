import { CleebusMessageResponse, CleepbusPeerInfos } from './cleepbus.types';

export type OnMessageBusMessageResponseCallback = (messageResponse: CleebusMessageResponse) => void;

export type OnMessageBusPeerConnectedCallback = (messageResponse: CleepbusPeerInfos) => void;

export type OnMessageBusPeerDisconnectedCallback = (messageResponse: CleepbusPeerInfos) => void;

export type OnMessageBusConnectedCallback = (connected: boolean) => void;

export type OnMessageBusErrorCallback = (message: string) => void;
