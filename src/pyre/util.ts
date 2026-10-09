import type { Logger, MessageContent } from "./types";

export function toFrames(content: MessageContent): Buffer[] {
  const arr = Array.isArray(content) ? content : [content];
  return arr.map((part) => (typeof part === "string" ? Buffer.from(part, "utf8") : part));
}

export function asBuffer(frame: Buffer | Uint8Array | string): Buffer {
  if (typeof frame === "string") {
    return Buffer.from(frame, "utf8");
  }
  return Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLogger(verbose: boolean): Logger {
  const prefix = "[pyre-ts]";
  return {
    debug: (...args: unknown[]) => {
      if (verbose) {
        console.error(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      console.error(prefix, ...args);
    },
    error: (...args: unknown[]) => {
      console.error(prefix, ...args);
    },
  };
}

export function wrapSequence(n: number): number {
  return n % 65535;
}

export function wrapStatus(n: number): number {
  return n & 0xff;
}
