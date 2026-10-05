export const BEACON_SIZE = 22;
export const BEACON_VERSION = 1;
export const ZRE_DISCOVERY_PORT = 5670;
export const BEACON_FILTER = Buffer.from("ZRE", "ascii");

export function encodeBeacon(uuid: Buffer, port: number): Buffer {
  if (uuid.length !== 16) {
    throw new Error("Beacon UUID must be 16 bytes");
  }
  const buf = Buffer.alloc(BEACON_SIZE);
  buf.write("ZRE", 0, 3, "ascii");
  buf.writeUInt8(BEACON_VERSION, 3);
  uuid.copy(buf, 4);
  buf.writeUInt16BE(port & 0xffff, 20);
  return buf;
}

export function decodeBeacon(frame: Buffer): { uuid: Buffer; port: number } | null {
  if (frame.length < BEACON_SIZE) {
    return null;
  }
  if (frame[0] !== 0x5a || frame[1] !== 0x52 || frame[2] !== 0x45) {
    return null;
  }
  if (frame[3] !== BEACON_VERSION) {
    return null;
  }
  return {
    uuid: Buffer.from(frame.subarray(4, 20)),
    port: frame.readUInt16BE(20),
  };
}
