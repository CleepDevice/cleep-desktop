import { hostname } from 'os';
import { appLogger } from '../app-logger';
import { appSettings } from '../app-settings';
import { getError } from '../utils/app.helpers';
import { IToolUpdateStatus, OnUpdateAvailableCallback } from '../app-updater';
import { OnDownloadProgressCallback } from '../utils/download';
import { Pyre, type EnterEvent, type ExitEvent, type ShoutEvent, type WhisperEvent } from '../pyre';
import { CleebusMessageResponse, CleepbusPeerInfos } from './cleepbus.types';
import { getMacAddresses, normalizeMacList } from './mac-addresses';
import {
  OnMessageBusConnectedCallback,
  OnMessageBusErrorCallback,
  OnMessageBusMessageResponseCallback,
  OnMessageBusPeerConnectedCallback,
  OnMessageBusPeerDisconnectedCallback,
  OnMessageBusUpdatingCallback,
} from './message-bus.types';

/** Built-in message bus version (pyre-ts), replaces external cleepbus binary versioning. */
export const CLEEPBUS_VERSION = '0.1.0';

const BUS_NAME = 'CLEEP';
const BUS_CHANNEL = 'CLEEP';
const UNCONFIGURED_DEVICE_HOSTNAME = 'cleepdevice';

/** Drop non-critical bus events when the deferred queue is this deep (keeps UI responsive). */
const MAX_QUEUED_EVENTS = 500;
const RESTART_DELAY_INITIAL_MS = 1000;
const RESTART_DELAY_MAX_MS = 30_000;
const METRICS_LOG_INTERVAL_MS = 60_000;

function str2bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  if (['yes', 'true', 't', 'y', '1'].includes(normalized)) {
    return true;
  }
  if (['no', 'false', 'f', 'n', '0'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function decodeHeaderValue(key: string, value: string): unknown {
  let raw = value;
  if (key === 'apps' && !raw.startsWith('[')) {
    raw = JSON.stringify(raw.split(','));
  }
  try {
    return JSON.parse(raw);
  } catch {
    return value;
  }
}

function parseEndpointIp(endpoint: string): string {
  try {
    // endpoint looks like tcp://192.168.1.10:5671
    const withoutScheme = endpoint.replace(/^tcp:\/\//i, '');
    return withoutScheme.split(':')[0] || '';
  } catch {
    return '';
  }
}

type QueuedBusEvent =
  | { kind: 'ENTER'; event: EnterEvent }
  | { kind: 'EXIT'; event: ExitEvent }
  | { kind: 'MESSAGE'; event: ShoutEvent | WhisperEvent };

/**
 * In-process CLEEP bus (pyre-ts).
 *
 * Resilience:
 * - unexpected STOP / start failure → automatic restart with backoff
 * - event handlers run via setImmediate so ZRE I/O is not blocked by JSON/IPC
 * - SHOUT/WHISPER dropped when the deferred queue is saturated (ENTER/EXIT kept)
 */
export class Cleepbus {
  private messageBusErrorCallback: OnMessageBusErrorCallback;
  private messageBusConnectedCallback: OnMessageBusConnectedCallback;
  private peerConnectedCallback: OnMessageBusPeerConnectedCallback;
  private peerDisconnectedCallback: OnMessageBusPeerDisconnectedCallback;
  private messageResponseCallback: OnMessageBusMessageResponseCallback;
  private pyre: Pyre | null = null;
  private peers = new Map<string, CleepbusPeerInfos>();
  private starting = false;
  private forcedStop = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private restartDelayMs = RESTART_DELAY_INITIAL_MS;
  private queuedEvents = 0;
  private droppedMessages = 0;
  private processedEvents = 0;

  public async start(): Promise<void> {
    // Explicit start always clears a previous intentional stop.
    this.forcedStop = false;
    if (this.pyre || this.starting) {
      return;
    }
    this.starting = true;
    let startFailed = false;

    try {
      const host = hostname();
      if ([...host].some((char) => char.charCodeAt(0) > 127)) {
        const error = `Your computer hostname "${host}" contains invalid characters. Please update it using only ASCII chars.`;
        appLogger.error(error);
        this.messageBusErrorCallback?.(error);
        // Configuration error: do not auto-restart.
        return;
      }

      const debug = appSettings.get<boolean>('cleep.debug');
      const uuid = appSettings.get<string>('cleep.uuid');

      this.pyre = new Pyre({ name: BUS_NAME, verbose: debug });
      for (const [key, value] of Object.entries(this.getHeaders(uuid))) {
        this.pyre.setHeader(key, value);
      }

      this.pyre.on('ENTER', (event) => this.enqueue({ kind: 'ENTER', event }, true));
      this.pyre.on('EXIT', (event) => this.enqueue({ kind: 'EXIT', event }, true));
      this.pyre.on('SHOUT', (event) => this.enqueue({ kind: 'MESSAGE', event }, false));
      this.pyre.on('WHISPER', (event) => this.enqueue({ kind: 'MESSAGE', event }, false));
      this.pyre.on('STOP', () => this.onPyreStopped());

      await this.pyre.join(BUS_CHANNEL);
      await this.pyre.start();

      this.restartDelayMs = RESTART_DELAY_INITIAL_MS;
      this.startMetricsTimer();
      appLogger.info(`Cleepbus (pyre-ts ${CLEEPBUS_VERSION}) started on ${this.pyre.endpoint()}`);
      this.messageBusConnectedCallback?.(true);
    } catch (error) {
      startFailed = true;
      appLogger.error('Fatal error starting cleepbus', { error });
      this.messageBusErrorCallback?.(getError(error as Error));
      await this.pyre?.stop().catch((): undefined => undefined);
      this.pyre = null;
    } finally {
      this.starting = false;
    }

    if (startFailed) {
      this.scheduleRestart('start failed');
    }
  }

  public stop(): void {
    this.forcedStop = true;
    this.clearRestartTimer();
    this.stopMetricsTimer();
    const node = this.pyre;
    this.pyre = null;
    this.peers.clear();
    if (node) {
      void node.stop().catch((error: Error) => {
        appLogger.error('Error stopping cleepbus', { error: getError(error) });
      });
    }
    this.messageBusConnectedCallback?.(false);
  }

  public async checkForUpdates(_force = false): Promise<IToolUpdateStatus> {
    // Message bus is embedded; no external binary to update.
    appLogger.info('No Cleepbus update available (built-in pyre-ts)');
    return { updateAvailable: false };
  }

  public setUpdateCallbacks(
    _updateAvailableCallback: OnUpdateAvailableCallback,
    _downloadProgressCallback: OnDownloadProgressCallback,
  ): void {
    // Embedded pyre-ts bus: no external download/update callbacks to wire.
  }

  public setCleepbusCallbacks(
    messageBusErrorCallback: OnMessageBusErrorCallback,
    messageBusConnectedCallback: OnMessageBusConnectedCallback,
    _messageBusUpdatingCallback: OnMessageBusUpdatingCallback,
    messageResponseCallback: OnMessageBusMessageResponseCallback,
    peerConnectedCallback: OnMessageBusPeerConnectedCallback,
    peerDisconnectedCallback: OnMessageBusPeerDisconnectedCallback,
  ): void {
    this.messageBusErrorCallback = messageBusErrorCallback;
    this.messageBusConnectedCallback = messageBusConnectedCallback;
    this.peerConnectedCallback = peerConnectedCallback;
    this.peerDisconnectedCallback = peerDisconnectedCallback;
    this.messageResponseCallback = messageResponseCallback;
  }

  public sendMessage(message: string): void {
    if (!this.pyre) {
      return;
    }
    void this.pyre.shout(BUS_CHANNEL, message).catch((error: Error) => {
      appLogger.error('Unable to shout cleepbus message', { error: getError(error) });
    });
  }

  public getInstalledVersion(): string {
    return CLEEPBUS_VERSION;
  }

  /** Test/diagnostics helper. */
  public getBusStats(): { queuedEvents: number; droppedMessages: number; processedEvents: number; peers: number } {
    return {
      queuedEvents: this.queuedEvents,
      droppedMessages: this.droppedMessages,
      processedEvents: this.processedEvents,
      peers: this.peers.size,
    };
  }

  private getHeaders(uuid: string): Record<string, string> {
    const macs = getMacAddresses();
    return {
      uuid,
      version: CLEEPBUS_VERSION,
      hostname: hostname(),
      port: '80',
      macs: JSON.stringify(macs),
      ssl: '0',
      auth: '0',
      cleepdesktop: '1',
      apps: JSON.stringify({}),
    };
  }

  /**
   * Defer application work off the pyre event path so UDP/TCP stay responsive.
   * Critical events (ENTER/EXIT) are always queued; messages may be dropped under load.
   */
  private enqueue(item: QueuedBusEvent, critical: boolean): void {
    if (!critical && this.queuedEvents >= MAX_QUEUED_EVENTS) {
      this.droppedMessages += 1;
      if (this.droppedMessages === 1 || this.droppedMessages % 50 === 0) {
        appLogger.warn('Cleepbus message queue saturated, dropping SHOUT/WHISPER', {
          queuedEvents: this.queuedEvents,
          droppedMessages: this.droppedMessages,
        });
      }
      return;
    }

    this.queuedEvents += 1;
    setImmediate(() => {
      this.queuedEvents = Math.max(0, this.queuedEvents - 1);
      try {
        if (item.kind === 'ENTER') {
          this.onPeerEnter(item.event);
        } else if (item.kind === 'EXIT') {
          this.onPeerExit(item.event);
        } else {
          this.onBusMessage(item.event);
        }
        this.processedEvents += 1;
      } catch (error) {
        appLogger.error('Unhandled error in cleepbus event handler', { error: getError(error as Error) });
      }
    });
  }

  private onPyreStopped(): void {
    if (this.forcedStop) {
      return;
    }
    appLogger.error('Cleepbus stopped unexpectedly, scheduling restart');
    this.pyre = null;
    this.peers.clear();
    this.stopMetricsTimer();
    this.messageBusConnectedCallback?.(false);
    this.scheduleRestart('unexpected stop');
  }

  private scheduleRestart(reason: string): void {
    if (this.forcedStop || this.restartTimer || this.starting) {
      return;
    }
    const delay = this.restartDelayMs;
    appLogger.warn(`Cleepbus restart in ${delay}ms`, { reason });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start();
    }, delay);
    this.restartDelayMs = Math.min(this.restartDelayMs * 2, RESTART_DELAY_MAX_MS);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartDelayMs = RESTART_DELAY_INITIAL_MS;
  }

  private startMetricsTimer(): void {
    this.stopMetricsTimer();
    this.metricsTimer = setInterval(() => {
      const stats = this.getBusStats();
      if (stats.droppedMessages > 0 || stats.queuedEvents > 50 || appSettings.get<boolean>('cleep.debug')) {
        appLogger.info('Cleepbus load', stats);
      }
    }, METRICS_LOG_INTERVAL_MS);
    this.metricsTimer.unref?.();
  }

  private stopMetricsTimer(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  private onPeerEnter(event: EnterEvent): void {
    if (event.peerName !== BUS_NAME) {
      appLogger.debug('Drop peer from another bus', { peerName: event.peerName, peerUuid: event.peerUuid });
      return;
    }

    const peerInfos = this.decodePeerInfos(event.headers);
    peerInfos.ident = event.peerUuid;
    peerInfos.ip = parseEndpointIp(event.endpoint);

    if (peerInfos.cleepdesktop) {
      appLogger.debug('Drop other cleep-desktop connection', { peerUuid: event.peerUuid });
      return;
    }

    peerInfos.online = true;
    peerInfos.extra = peerInfos.extra || {};
    peerInfos.extra.connectedat = Math.round(Date.now() / 1000);
    peerInfos.extra.configured =
      Boolean(peerInfos.hostname?.trim()) && peerInfos.hostname !== UNCONFIGURED_DEVICE_HOSTNAME;

    this.peers.set(event.peerUuid, peerInfos);
    appLogger.info('Peer connected', { uuid: peerInfos.uuid, hostname: peerInfos.hostname, ip: peerInfos.ip });
    this.peerConnectedCallback?.(peerInfos);
  }

  private onPeerExit(event: ExitEvent): void {
    if (event.peerName !== BUS_NAME) {
      return;
    }

    const peerInfos = this.peers.get(event.peerUuid);
    if (peerInfos) {
      peerInfos.online = false;
      this.peers.delete(event.peerUuid);
    }
    appLogger.info('Peer disconnected', { peerUuid: event.peerUuid, uuid: peerInfos?.uuid });
    if (peerInfos) {
      this.peerDisconnectedCallback?.(peerInfos);
    }
  }

  private onBusMessage(event: ShoutEvent | WhisperEvent): void {
    if (event.peerName !== BUS_NAME) {
      return;
    }
    if (event.type === 'SHOUT' && event.group !== BUS_CHANNEL) {
      return;
    }

    const peerInfos = this.peers.get(event.peerUuid);
    if (!peerInfos) {
      appLogger.debug('Drop message from unknown peer', { peerUuid: event.peerUuid });
      return;
    }

    const raw = event.content[0]?.toString('utf8') ?? '';
    const parsed = JSON.parse(raw) as CleebusMessageResponse;
    appLogger.debug('Message received from Cleepbus', { peerUuid: event.peerUuid, parsed });
    this.messageResponseCallback?.(peerInfos, {
      event: parsed.event,
      command: parsed.command,
      to: parsed.to,
      params: parsed.params ?? {},
      startup: Boolean(parsed.startup),
      device_id: parsed.device_id,
      sender: parsed.sender ?? '',
    });
  }

  private decodePeerInfos(headers: Record<string, string>): CleepbusPeerInfos {
    const reserved = new Set(['uuid', 'hostname', 'port', 'ssl', 'auth', 'cleepdesktop', 'macs']);
    let macs: string[] = [];
    try {
      macs = normalizeMacList(JSON.parse(headers.macs ?? '[]'));
    } catch {
      macs = [];
    }

    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!reserved.has(key)) {
        extra[key] = decodeHeaderValue(key, value);
      }
    }

    return {
      uuid: headers.uuid,
      hostname: headers.hostname,
      ip: '',
      port: Number.parseInt(headers.port ?? '80', 10) || 80,
      ssl: str2bool(headers.ssl, false),
      auth: str2bool(headers.auth, false),
      cleepdesktop: str2bool(headers.cleepdesktop, false),
      macs,
      online: false,
      extra,
    };
  }
}

export const cleepbus = new Cleepbus();
