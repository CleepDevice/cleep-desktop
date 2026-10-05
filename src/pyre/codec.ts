import type { Headers } from "./types";

export const ZRE_SIGNATURE = 0xaaa1;
export const ZRE_VERSION = 2;

export const ZreMsgId = {
  HELLO: 1,
  WHISPER: 2,
  SHOUT: 3,
  JOIN: 4,
  LEAVE: 5,
  PING: 6,
  PING_OK: 7,
} as const;

export type ZreMsgId = (typeof ZreMsgId)[keyof typeof ZreMsgId];

export type ZreHello = {
  id: typeof ZreMsgId.HELLO;
  sequence: number;
  endpoint: string;
  groups: string[];
  status: number;
  name: string;
  headers: Headers;
};

export type ZreWhisper = {
  id: typeof ZreMsgId.WHISPER;
  sequence: number;
  content: Buffer[];
};

export type ZreShout = {
  id: typeof ZreMsgId.SHOUT;
  sequence: number;
  group: string;
  content: Buffer[];
};

export type ZreJoin = {
  id: typeof ZreMsgId.JOIN;
  sequence: number;
  group: string;
  status: number;
};

export type ZreLeave = {
  id: typeof ZreMsgId.LEAVE;
  sequence: number;
  group: string;
  status: number;
};

export type ZrePing = {
  id: typeof ZreMsgId.PING;
  sequence: number;
};

export type ZrePingOk = {
  id: typeof ZreMsgId.PING_OK;
  sequence: number;
};

export type ZreMessage = ZreHello | ZreWhisper | ZreShout | ZreJoin | ZreLeave | ZrePing | ZrePingOk;

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type OutgoingZreMessage = DistributiveOmit<ZreMessage, "sequence">;

class Reader {
  constructor(
    private readonly buf: Buffer,
    private offset = 0,
  ) {}

  remaining(): number {
    return this.buf.length - this.offset;
  }

  uint8(): number {
    const value = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  uint16(): number {
    const value = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  uint32(): number {
    const value = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  string(): string {
    const len = this.uint8();
    const value = this.buf.subarray(this.offset, this.offset + len).toString("utf8");
    this.offset += len;
    return value;
  }

  longstr(): string {
    const len = this.uint32();
    const value = this.buf.subarray(this.offset, this.offset + len).toString("utf8");
    this.offset += len;
    return value;
  }
}

class Writer {
  private readonly chunks: Buffer[] = [];

  uint8(value: number): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value);
    this.chunks.push(buf);
  }

  uint16(value: number): void {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(value);
    this.chunks.push(buf);
  }

  uint32(value: number): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value);
    this.chunks.push(buf);
  }

  string(value: string): void {
    const data = Buffer.from(value, "utf8");
    if (data.length > 255) {
      throw new Error(`ZRE string exceeds 255 bytes: ${value}`);
    }
    this.uint8(data.length);
    this.chunks.push(data);
  }

  longstr(value: string): void {
    const data = Buffer.from(value, "utf8");
    this.uint32(data.length);
    this.chunks.push(data);
  }

  concat(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function writeHeader(writer: Writer, id: ZreMsgId): void {
  writer.uint16(ZRE_SIGNATURE);
  writer.uint8(id);
  writer.uint8(ZRE_VERSION);
}

export function encodeZre(message: ZreMessage): Buffer[] {
  const writer = new Writer();
  writeHeader(writer, message.id);
  writer.uint16(message.sequence);

  switch (message.id) {
    case ZreMsgId.HELLO: {
      writer.string(message.endpoint);
      writer.uint32(message.groups.length);
      for (const group of message.groups) {
        writer.longstr(group);
      }
      writer.uint8(message.status);
      writer.string(message.name);
      const entries = Object.entries(message.headers);
      writer.uint32(entries.length);
      for (const [key, value] of entries) {
        writer.string(key);
        writer.longstr(value);
      }
      return [writer.concat()];
    }
    case ZreMsgId.WHISPER:
      return [writer.concat(), ...message.content];
    case ZreMsgId.SHOUT:
      writer.string(message.group);
      return [writer.concat(), ...message.content];
    case ZreMsgId.JOIN:
    case ZreMsgId.LEAVE:
      writer.string(message.group);
      writer.uint8(message.status);
      return [writer.concat()];
    case ZreMsgId.PING:
    case ZreMsgId.PING_OK:
      return [writer.concat()];
  }
}

export function decodeZre(frames: Array<Buffer | Uint8Array>): ZreMessage | null {
  if (frames.length === 0) {
    return null;
  }
  const header = Buffer.from(frames[0]);
  const rest = frames.slice(1).map((frame) => Buffer.from(frame));
  if (header.length < 6) {
    return null;
  }

  const reader = new Reader(header);
  const signature = reader.uint16();
  if (signature !== ZRE_SIGNATURE) {
    return null;
  }
  const id = reader.uint8();
  const version = reader.uint8();
  if (version !== ZRE_VERSION) {
    return null;
  }
  const sequence = reader.uint16();

  try {
    switch (id) {
      case ZreMsgId.HELLO: {
        const endpoint = reader.string();
        const groupCount = reader.uint32();
        const groups: string[] = [];
        for (let i = 0; i < groupCount; i += 1) {
          groups.push(reader.longstr());
        }
        const status = reader.uint8();
        const name = reader.string();
        const headerCount = reader.uint32();
        const headers: Headers = {};
        for (let i = 0; i < headerCount; i += 1) {
          const key = reader.string();
          headers[key] = reader.longstr();
        }
        return { id, sequence, endpoint, groups, status, name, headers };
      }
      case ZreMsgId.WHISPER:
        return { id, sequence, content: rest };
      case ZreMsgId.SHOUT:
        return { id, sequence, group: reader.string(), content: rest };
      case ZreMsgId.JOIN:
        return { id, sequence, group: reader.string(), status: reader.uint8() };
      case ZreMsgId.LEAVE:
        return { id, sequence, group: reader.string(), status: reader.uint8() };
      case ZreMsgId.PING:
        return { id, sequence };
      case ZreMsgId.PING_OK:
        return { id, sequence };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function commandName(id: ZreMsgId): string {
  switch (id) {
    case ZreMsgId.HELLO:
      return "HELLO";
    case ZreMsgId.WHISPER:
      return "WHISPER";
    case ZreMsgId.SHOUT:
      return "SHOUT";
    case ZreMsgId.JOIN:
      return "JOIN";
    case ZreMsgId.LEAVE:
      return "LEAVE";
    case ZreMsgId.PING:
      return "PING";
    case ZreMsgId.PING_OK:
      return "PING_OK";
  }
}
