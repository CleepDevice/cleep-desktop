import { Dealer } from "./zmq";
import { encodeZre, type OutgoingZreMessage, type ZreMessage, ZreMsgId } from "./codec";
import type { Headers, Logger } from "./types";
import { routingId } from "./uuid";
import { wrapSequence } from "./util";

export const PEER_EVASIVE_MS = 10_000;
export const PEER_EXPIRED_MS = 30_000;

export class Peer {
  mailbox: Dealer | null = null;
  endpoint = "";
  name = "notset";
  evasiveAt = 0;
  expiredAt = 0;
  connected = false;
  ready = false;
  status = 0;
  sentSequence = 0;
  wantSequence = 0;
  headers: Headers = {};
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly uuid: string,
    private readonly originUuidBytes: Buffer,
    private readonly logger: Logger,
  ) {}

  connect(endpoint: string): void {
    if (this.connected) {
      return;
    }
    const mailbox = new Dealer({
      linger: 0,
      sendHighWaterMark: 3_000,
      sendTimeout: 0,
    });
    mailbox.routingId = routingId(this.originUuidBytes);
    mailbox.connect(endpoint);
    this.mailbox = mailbox;
    this.endpoint = endpoint;
    this.connected = true;
    this.ready = false;
    this.logger.debug(`Connecting to peer ${this.uuid} on ${endpoint}`);
  }

  disconnect(): void {
    if (!this.connected) {
      return;
    }
    this.logger.debug(`Disconnecting peer ${this.name}`);
    try {
      this.mailbox?.close();
    } catch {
      // ignore
    }
    this.mailbox = null;
    this.endpoint = "";
    this.connected = false;
    this.ready = false;
  }

  async send(message: OutgoingZreMessage): Promise<void> {
    this.sendQueue = this.sendQueue.then(() => this.sendNow(message));
    await this.sendQueue;
  }

  private async sendNow(message: OutgoingZreMessage): Promise<void> {
    if (!this.connected || !this.mailbox) {
      this.logger.debug(`Peer ${this.uuid} is not connected`);
      return;
    }
    this.sentSequence = wrapSequence(this.sentSequence + 1);
    const framed = encodeZre({ ...message, sequence: this.sentSequence } as ZreMessage);
    try {
      await this.mailbox.send(framed);
    } catch (err) {
      this.logger.debug(`Error sending to peer ${this.name}:`, err);
      this.disconnect();
    }
  }

  refresh(): void {
    const now = Date.now();
    this.evasiveAt = now + PEER_EVASIVE_MS;
    this.expiredAt = now + PEER_EXPIRED_MS;
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
