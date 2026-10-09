import { EventEmitter } from "node:events";
import { PyreNode } from "./node";
import type {
  EnterEvent,
  ExitEvent,
  JoinEvent,
  LeaveEvent,
  PyreEvent,
  PyreOptions,
  ShoutEvent,
  StopEvent,
  WhisperEvent,
  MessageContent,
  Headers,
} from "./types";
import { createLogger } from "./util";

export type { PyreEvent, PyreOptions, MessageContent, Headers };

type EventMap = {
  ENTER: [EnterEvent];
  EXIT: [ExitEvent];
  JOIN: [JoinEvent];
  LEAVE: [LeaveEvent];
  WHISPER: [WhisperEvent];
  SHOUT: [ShoutEvent];
  STOP: [StopEvent];
  event: [PyreEvent];
};

export class Pyre extends EventEmitter {
  private readonly node: PyreNode;
  private readonly queue: PyreEvent[] = [];
  private readonly waiters: Array<(event: PyreEvent) => void> = [];

  constructor(name?: string | PyreOptions, options: PyreOptions = {}) {
    super();
    const opts: PyreOptions =
      typeof name === "string" ? { ...options, name } : { ...name, ...options };
    const logger = createLogger(Boolean(opts.verbose));
    this.node = new PyreNode(opts, (event) => this.pushEvent(event), logger);
  }

  override on<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  override once<K extends keyof EventMap>(event: K, listener: (...args: EventMap[K]) => void): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  uuid(): string {
    return this.node.uuid;
  }

  name(): string {
    return this.node.name;
  }

  setHeader(key: string, value: string): void {
    this.node.setHeader(key, value);
  }

  setVerbose(verbose = true): void {
    this.node.setVerbose(verbose);
  }

  setPort(port: number): void {
    this.node.setPort(port);
  }

  setInterval(intervalMs: number): void {
    this.node.setInterval(intervalMs);
  }

  setInterface(name: string): void {
    this.node.setInterface(name);
  }

  async start(): Promise<void> {
    await this.node.start();
  }

  async stop(): Promise<void> {
    await this.node.stop();
  }

  async join(group: string): Promise<void> {
    await this.node.join(group);
  }

  async leave(group: string): Promise<void> {
    await this.node.leave(group);
  }

  async whisper(peerUuid: string, content: MessageContent): Promise<void> {
    await this.node.whisper(peerUuid, content);
  }

  async shout(group: string, content: MessageContent): Promise<void> {
    await this.node.shout(group, content);
  }

  peers(): string[] {
    return [...this.node.peers.keys()];
  }

  peersByGroup(group: string): string[] {
    return this.node.peersByGroup(group);
  }

  ownGroups(): string[] {
    return [...this.node.ownGroups];
  }

  peerGroups(): string[] {
    return [...this.node.peerGroups.keys()];
  }

  endpoint(): string {
    return this.node.endpoint;
  }

  peerAddress(peerUuid: string): string {
    return this.node.peerAddress(peerUuid);
  }

  peerHeaderValue(peerUuid: string, name: string): string {
    return this.node.peerHeader(peerUuid, name);
  }

  peerHeaders(peerUuid: string): Headers | undefined {
    return this.node.peerHeaders(peerUuid);
  }

  getPeerName(peerUuid: string): string {
    return this.node.peerName(peerUuid);
  }

  recv(): Promise<PyreEvent> {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async *events(): AsyncIterableIterator<PyreEvent> {
    while (true) {
      yield await this.recv();
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<PyreEvent> {
    yield* this.events();
  }

  private pushEvent(event: PyreEvent): void {
    this.emit(event.type, event);
    this.emit("event", event);
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(event);
    } else {
      this.queue.push(event);
    }
  }
}
