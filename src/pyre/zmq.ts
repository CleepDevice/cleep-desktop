import { createConnection, createServer, type Server, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import {
  decodeGreeting,
  decodeProperties,
  encodeCommand,
  encodeGreeting,
  encodeMessage,
  encodeReady,
  FrameParser,
  GREETING_SIZE,
  parseCommand,
  type ZmtpFrame,
} from "./zmtp";

export function parseTcpEndpoint(endpoint: string): { host: string; port: number } {
  if (!endpoint.startsWith("tcp://")) {
    throw new Error(`Only tcp:// endpoints are supported: ${endpoint}`);
  }
  const rest = endpoint.slice("tcp://".length);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0) {
    throw new Error(`Invalid TCP endpoint: ${endpoint}`);
  }
  const host = rest.slice(0, colon);
  const portPart = rest.slice(colon + 1);
  return {
    host: host === "*" ? "0.0.0.0" : host,
    port: portPart === "*" ? 0 : Number(portPart),
  };
}

function property(props: Map<string, Buffer>, ...names: string[]): Buffer | undefined {
  for (const name of names) {
    for (const [key, value] of props) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return value;
      }
    }
  }
  return undefined;
}

class ZmtpConnection {
  private readonly parser = new FrameParser();
  private greetingBuf = Buffer.alloc(0);
  private greetingDone = false;
  private parts: Buffer[] = [];
  private handshakeDone = false;
  private closed = false;
  private failed = false;
  private readonly greetingPromise: Promise<Buffer>;
  private readonly readyPromise: Promise<Map<string, Buffer>>;
  private greetingResolve!: (buf: Buffer) => void;
  private readyResolve!: (props: Map<string, Buffer>) => void;
  private rejectGreeting!: (err: Error) => void;
  private rejectReady!: (err: Error) => void;
  onMessage: ((frames: Buffer[]) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(readonly socket: Socket) {
    this.greetingPromise = new Promise((resolve, reject) => {
      this.greetingResolve = resolve;
      this.rejectGreeting = reject;
    });
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.rejectReady = reject;
    });
    void this.greetingPromise.catch((): undefined => undefined);
    void this.readyPromise.catch((): undefined => undefined);
    socket.setNoDelay(true);
    socket.setKeepAlive(true);
    socket.on("data", (chunk) => this.onData(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    socket.on("error", (err) => this.fail(err));
    socket.on("close", () => this.handleClose());
  }

  async handshake(socketType: string, identity?: Buffer): Promise<Map<string, Buffer>> {
    this.socket.write(encodeGreeting(0));
    const greeting = await this.greetingPromise;
    const decoded = decodeGreeting(greeting);
    if (decoded.major < 3) {
      throw new Error(`Unsupported ZMTP version ${decoded.major}.${decoded.minor}`);
    }
    if (decoded.mechanism !== "NULL") {
      throw new Error(`Unsupported ZMTP mechanism ${decoded.mechanism}`);
    }
    this.socket.write(encodeReady(socketType, identity));
    return this.readyPromise;
  }

  send(frames: Buffer[]): void {
    if (this.closed) {
      throw new Error("ZMTP connection is closed");
    }
    this.socket.write(encodeMessage(frames));
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.destroy();
  }

  private onData(chunk: Buffer): void {
    try {
      if (!this.greetingDone) {
        this.greetingBuf = Buffer.concat([this.greetingBuf, chunk]);
        if (this.greetingBuf.length < GREETING_SIZE) {
          return;
        }
        const greeting = this.greetingBuf.subarray(0, GREETING_SIZE);
        chunk = this.greetingBuf.subarray(GREETING_SIZE);
        this.greetingBuf = Buffer.alloc(0);
        this.greetingDone = true;
        this.greetingResolve(greeting);
        if (chunk.length === 0) {
          return;
        }
      }
      for (const frame of this.parser.push(chunk)) {
        this.handleFrame(frame);
      }
    } catch (err) {
      this.fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleFrame(frame: ZmtpFrame): void {
    if (frame.command) {
      const command = parseCommand(frame.body);
      if (command.name === "READY") {
        this.handshakeDone = true;
        this.readyResolve(decodeProperties(command.data));
        return;
      }
      if (command.name === "ERROR") {
        this.fail(new Error(`ZMTP ERROR: ${command.data.toString("utf8")}`));
        return;
      }
      if (command.name === "PING") {
        const context = command.data.length >= 2 ? command.data.subarray(2) : Buffer.alloc(0);
        this.socket.write(encodeCommand("PONG", context));
      }
      return;
    }
    this.parts.push(frame.body);
    if (!frame.more) {
      const frames = this.parts;
      this.parts = [];
      if (this.handshakeDone) {
        this.onMessage?.(frames);
      }
    }
  }

  private fail(err: Error): void {
    if (this.failed) {
      return;
    }
    this.failed = true;
    if (!this.greetingDone) {
      this.rejectGreeting(err);
    }
    if (!this.handshakeDone) {
      this.rejectReady(err);
    }
    this.close();
  }

  private handleClose(): void {
    this.closed = true;
    if (!this.failed) {
      this.fail(new Error("ZMTP connection closed"));
    }
    this.onClose?.();
  }
}

export type RouterOptions = {
  linger?: number;
  handover?: boolean;
};

export class Router {
  lastEndpoint: string | null = null;
  private server: Server | null = null;
  private readonly connections = new Map<string, ZmtpConnection>();
  private readonly messages: Buffer[][] = [];
  private readonly waiters: Array<(frames: Buffer[]) => void> = [];
  private readonly rejecters: Array<(err: Error) => void> = [];
  private closed = false;
  private readonly handover: boolean;

  constructor(options: RouterOptions = {}) {
    this.handover = options.handover ?? true;
  }

  async bind(endpoint: string): Promise<void> {
    const { host, port } = parseTcpEndpoint(endpoint);
    const server = createServer((socket) => {
      void this.accept(socket);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to bind ZMTP router");
    }
    this.lastEndpoint = `tcp://${host}:${addr.port}`;
  }

  receive(): Promise<Buffer[]> {
    if (this.closed) {
      return Promise.reject(new Error("Router is closed"));
    }
    const queued = this.messages.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push(resolve);
      this.rejecters.push(reject);
    });
  }

  close(): void {
    this.closed = true;
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.server?.close();
    this.server = null;
    const closed = new Error("Router is closed");
    while (this.rejecters.length > 0) {
      this.waiters.shift();
      this.rejecters.shift()?.(closed);
    }
  }

  private async accept(socket: Socket): Promise<void> {
    const conn = new ZmtpConnection(socket);
    try {
      const props = await conn.handshake("ROUTER");
      const socketType = property(props, "Socket-Type")?.toString("ascii");
      if (socketType && socketType !== "DEALER" && socketType !== "ROUTER" && socketType !== "REQ") {
        conn.close();
        return;
      }
      let identity = property(props, "Identity", "Routing-Id");
      if (!identity || identity.length === 0) {
        identity = Buffer.concat([Buffer.from([0x00]), randomBytes(4)]);
      }
      const key = identity.toString("hex");
      const existing = this.connections.get(key);
      if (existing) {
        if (!this.handover) {
          conn.close();
          return;
        }
        existing.close();
      }
      this.connections.set(key, conn);
      conn.onMessage = (frames) => this.push([identity, ...frames]);
      conn.onClose = () => {
        if (this.connections.get(key) === conn) {
          this.connections.delete(key);
        }
      };
    } catch {
      conn.close();
    }
  }

  private push(frames: Buffer[]): void {
    const waiter = this.waiters.shift();
    this.rejecters.shift();
    if (waiter) {
      waiter(frames);
    } else {
      this.messages.push(frames);
    }
  }
}

export type DealerOptions = {
  linger?: number;
  sendHighWaterMark?: number;
  sendTimeout?: number;
};

export class Dealer {
  routingId: Buffer | null = null;
  private conn: ZmtpConnection | null = null;
  private ready: Promise<void> = Promise.resolve();

  constructor(_options: DealerOptions = {}) {}

  connect(endpoint: string): void {
    const { host, port } = parseTcpEndpoint(endpoint);
    this.ready = new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const conn = new ZmtpConnection(socket);
      this.conn = conn;
      conn.onClose = () => {
        if (this.conn === conn) {
          this.conn = null;
        }
      };
      socket.once("connect", () => {
        void conn
          .handshake("DEALER", this.routingId ?? undefined)
          .then(() => resolve())
          .catch((err: Error) => {
            reject(err);
            conn.close();
          });
      });
      socket.once("error", (err) => reject(err));
    });
  }

  async send(frames: Buffer[]): Promise<void> {
    await this.ready;
    if (!this.conn) {
      throw new Error("Dealer is not connected");
    }
    this.conn.send(frames);
  }

  close(): void {
    this.conn?.close();
    this.conn = null;
  }
}
