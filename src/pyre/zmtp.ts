/** ZMTP 3.0/3.1 NULL — the TCP framing used by libzmq and pyre-gevent. */

export const FLAG_MORE = 0x01;
export const FLAG_LONG = 0x02;
export const FLAG_COMMAND = 0x04;

export const GREETING_SIZE = 64;
export const ZMTP_MAJOR = 3;
export const MAX_FRAME_SIZE = 16 * 1024 * 1024;

export type ZmtpFrame = {
  command: boolean;
  more: boolean;
  body: Buffer;
};

export function encodeGreeting(minor = 0): Buffer {
  const greeting = Buffer.alloc(GREETING_SIZE);
  greeting[0] = 0xff;
  greeting[9] = 0x7f;
  greeting[10] = ZMTP_MAJOR;
  greeting[11] = minor;
  greeting.write("NULL", 12, "ascii");
  return greeting;
}

export function decodeGreeting(buf: Buffer): { major: number; minor: number; mechanism: string } {
  if (buf.length < GREETING_SIZE) {
    throw new Error("Incomplete ZMTP greeting");
  }
  if (buf[0] !== 0xff || buf[9] !== 0x7f) {
    throw new Error("Invalid ZMTP signature");
  }
  const major = buf[10];
  const minor = buf[11];
  const mechanism = buf
    .subarray(12, 32)
    .toString("ascii")
    .replace(/\0+$/, "");
  return { major, minor, mechanism };
}

export function encodeFrame(body: Buffer, options: { more?: boolean; command?: boolean } = {}): Buffer {
  const flags =
    (options.more ? FLAG_MORE : 0) | (options.command ? FLAG_COMMAND : 0) | (body.length > 255 ? FLAG_LONG : 0);
  if (body.length > 255) {
    const header = Buffer.alloc(9);
    header[0] = flags;
    header.writeBigUInt64BE(BigInt(body.length), 1);
    return Buffer.concat([header, body]);
  }
  return Buffer.concat([Buffer.from([flags, body.length]), body]);
}

export function encodeCommand(name: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const nameBuf = Buffer.from(name, "ascii");
  const body = Buffer.concat([Buffer.from([nameBuf.length]), nameBuf, data]);
  return encodeFrame(body, { command: true });
}

export function encodeProperties(properties: Record<string, Buffer | string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(properties)) {
    const nameBuf = Buffer.from(name, "ascii");
    const valueBuf = typeof value === "string" ? Buffer.from(value) : value;
    const header = Buffer.alloc(1 + nameBuf.length + 4);
    header.writeUInt8(nameBuf.length, 0);
    nameBuf.copy(header, 1);
    header.writeUInt32BE(valueBuf.length, 1 + nameBuf.length);
    chunks.push(header, valueBuf);
  }
  return Buffer.concat(chunks);
}

export function decodeProperties(data: Buffer): Map<string, Buffer> {
  const props = new Map<string, Buffer>();
  let offset = 0;
  while (offset < data.length) {
    const nameLen = data[offset];
    offset += 1;
    const name = data.subarray(offset, offset + nameLen).toString("ascii");
    offset += nameLen;
    const valueLen = data.readUInt32BE(offset);
    offset += 4;
    props.set(name, Buffer.from(data.subarray(offset, offset + valueLen)));
    offset += valueLen;
  }
  return props;
}

export function parseCommand(body: Buffer): { name: string; data: Buffer } {
  if (body.length < 1) {
    throw new Error("Empty ZMTP command");
  }
  const nameLen = body[0];
  const name = body.subarray(1, 1 + nameLen).toString("ascii");
  return { name, data: body.subarray(1 + nameLen) };
}

export function encodeReady(socketType: string, identity?: Buffer): Buffer {
  const properties: Record<string, Buffer | string> = { "Socket-Type": socketType };
  if (identity && identity.length > 0) {
    properties.Identity = identity;
  }
  return encodeCommand("READY", encodeProperties(properties));
}

export function encodeMessage(frames: Buffer[]): Buffer {
  return Buffer.concat(frames.map((frame, i) => encodeFrame(frame, { more: i < frames.length - 1 })));
}

export class FrameParser {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): ZmtpFrame[] {
    this.buf = this.buf.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.buf, chunk]);
    const frames: ZmtpFrame[] = [];
    while (true) {
      const frame = this.tryRead();
      if (!frame) {
        break;
      }
      frames.push(frame);
    }
    return frames;
  }

  private tryRead(): ZmtpFrame | null {
    if (this.buf.length < 2) {
      return null;
    }
    const flags = this.buf[0];
    const long = (flags & FLAG_LONG) !== 0;
    const headerSize = long ? 9 : 2;
    if (this.buf.length < headerSize) {
      return null;
    }
    const size = long ? Number(this.buf.readBigUInt64BE(1)) : this.buf[1];
    if (size > MAX_FRAME_SIZE) {
      throw new Error(`ZMTP frame too large (${size})`);
    }
    if (this.buf.length < headerSize + size) {
      return null;
    }
    const body = Buffer.from(this.buf.subarray(headerSize, headerSize + size));
    this.buf = this.buf.subarray(headerSize + size);
    return {
      command: (flags & FLAG_COMMAND) !== 0,
      more: (flags & FLAG_MORE) !== 0,
      body,
    };
  }
}
