import { Dealer } from "./zmq";
import { encodeZre, type OutgoingZreMessage, type ZreMessage, ZreMsgId } from "./codec";
import type { Headers, Logger } from "./types";
import { routingId } from "./uuid";
import { monoNow, wrapSequence } from "./util";

export const PEER_EVASIVE_MS = 10_000;
export const PEER_EXPIRED_MS = 30_000;

export class Peer {
  mailbox: Dealer | null = null;
  endpoint = "";
  /** Survives disconnect so beacon/evasive can reopen the mailbox. */
  lastEndpoint = "";
  name = "notset";
  /** Monotonic deadline (``monoNow()``), not wall clock. */
  evasiveAt = 0;
  /** Monotonic deadline (``monoNow()``), not wall clock. */
  expiredAt = 0;
  connected = false;
  ready = false;
  status = 0;
  sentSequence = 0;
  wantSequence = 0;
  headers: Headers = {};
  private sendQueue: Promise<void> = Promise.resolve();
  /** Monotonic id so a late send failure cannot disconnect a newer mailbox. */
  private mailboxGeneration = 0;

  constructor(
    readonly uuid: string,
    private readonly originUuidBytes: Buffer,
    private readonly logger: Logger,
  ) {}

  connect(endpoint: string): void {
    if (this.connected) {
      return;
    }
    const generation = ++this.mailboxGeneration;
    const mailbox = new Dealer({
      linger: 0,
      sendHighWaterMark: 3_000,
      sendTimeout: 0,
      connectTimeoutMs: 5_000,
    });
    mailbox.routingId = routingId(this.originUuidBytes);
    mailbox.onClose = () => {
      if (this.mailboxGeneration !== generation) {
        return;
      }
      // TCP dropped while Peer still thought it was connected (beacon-masked half-open).
      this.mailbox = null;
      this.endpoint = "";
      this.connected = false;
      this.ready = false;
    };
    mailbox.connect(endpoint);
    this.mailbox = mailbox;
    this.endpoint = endpoint;
    this.lastEndpoint = endpoint;
    this.connected = true;
    this.ready = false;
    // Fresh mailbox ⇒ fresh ZRE sequences so the remote HELLO check expects 1 again.
    this.sentSequence = 0;
    this.wantSequence = 0;
    this.logger.debug(`Connecting to peer ${this.uuid} on ${endpoint}`);
  }

  disconnect(): void {
    if (!this.connected && !this.mailbox) {
      return;
    }
    this.logger.debug(`Disconnecting peer ${this.name}`);
    this.mailboxGeneration += 1;
    const mailbox = this.mailbox;
    this.mailbox = null;
    this.endpoint = "";
    this.connected = false;
    this.ready = false;
    try {
      mailbox?.close();
    } catch {
      // ignore
    }
  }

  async send(message: OutgoingZreMessage): Promise<void> {
    // Keep the chain alive after a rejected send so reconnect HELLO is not stuck forever.
    this.sendQueue = this.sendQueue.then(
      () => this.sendNow(message),
      () => this.sendNow(message),
    );
    await this.sendQueue;
  }

  private isApplicationTraffic(message: OutgoingZreMessage): boolean {
    return message.id === ZreMsgId.WHISPER || message.id === ZreMsgId.SHOUT;
  }

  private async sendNow(message: OutgoingZreMessage): Promise<void> {
    const mailbox = this.mailbox;
    const generation = this.mailboxGeneration;
    if (!this.connected || !mailbox) {
      this.logger.debug(`Peer ${this.uuid} is not connected`);
      // Application traffic must fail the caller (e.g. sendCommandToPeer) instead of
      // resolving and leaving them on an 8s response timeout.
      if (this.isApplicationTraffic(message)) {
        throw new Error(`Peer ${this.uuid} is not connected`);
      }
      return;
    }
    this.sentSequence = wrapSequence(this.sentSequence + 1);
    const framed = encodeZre({ ...message, sequence: this.sentSequence } as ZreMessage);
    try {
      await mailbox.send(framed);
    } catch (err) {
      this.logger.debug(`Error sending to peer ${this.name}:`, err);
      // Match pyre-gevent: drop the mailbox only. Leave evasive/expired timers alone so
      // UDP beacons can keep refreshing the peer while we reconnect — forcing expireAt=0
      // caused false EXIT and a HELLO-fail → remove → beacon → HELLO-fail loop that left
      // devices offline until Desktop restart.
      // Only tear down if this failure belongs to the current mailbox generation.
      if (this.mailboxGeneration === generation) {
        this.disconnect();
      }
      if (this.isApplicationTraffic(message)) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  /** Full refresh after real ZRE traffic (HELLO/PING/WHISPER/…). */
  refresh(): void {
    const now = monoNow();
    this.evasiveAt = now + PEER_EVASIVE_MS;
    this.expiredAt = now + PEER_EXPIRED_MS;
  }

  /**
   * UDP beacon presence only: keep the peer from expiring, but do not reset the
   * evasive timer so a dead TCP mailbox still gets a PING after PEER_EVASIVE_MS.
   */
  refreshExpiry(): void {
    this.expiredAt = monoNow() + PEER_EXPIRED_MS;
  }

  messagesLost(message: ZreMessage): boolean {
    if (message.id === ZreMsgId.HELLO) {
      this.wantSequence = 1;
    } else {
      this.wantSequence = wrapSequence(this.wantSequence + 1);
    }
    if (this.wantSequence !== message.sequence) {
      this.logger.debug(
        `seq error from ${this.name}: expected ${this.wantSequence}, got ${message.sequence}`,
      );
      return true;
    }
    return false;
  }
}
