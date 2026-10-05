import { randomUUID } from "node:crypto";

export function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

export function bytesToUuid(bytes: Buffer | Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`UUID bytes must be 16 octets, got ${bytes.length}`);
  }
  const h = Buffer.from(bytes).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomUuid(): { str: string; bytes: Buffer } {
  const str = randomUUID();
  return { str, bytes: uuidToBytes(str) };
}

export function routingId(uuidBytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x01]), uuidBytes]);
}

export function identityFromRoutingId(frame: Buffer | Uint8Array): Buffer | null {
  const buf = Buffer.from(frame);
  if (buf.length !== 17 || buf[0] !== 0x01) {
    return null;
  }
  return buf.subarray(1);
}
