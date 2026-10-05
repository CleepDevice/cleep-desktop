import { createSocket, type Socket } from "node:dgram";
import { EventEmitter } from "node:events";
import { BEACON_FILTER } from "./beacon-codec";
import type { IfaceInfo } from "./iface";
import type { Logger } from "./types";

export type BeaconMessage = {
  address: string;
  frame: Buffer;
};

export class ZBeacon extends EventEmitter {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private transmit: Buffer | null = null;
  private filter: Buffer = BEACON_FILTER;
  private closed = false;

  constructor(
    private readonly iface: IfaceInfo,
    private readonly port: number,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {
    super();
  }

  async start(): Promise<void> {
    const socket = createSocket({ type: "udp4", reuseAddr: true });
    this.socket = socket;

    socket.on("message", (msg, rinfo) => {
      this.handleUdp(msg, rinfo.address);
    });
    socket.on("error", (err) => {
      this.logger.warn("Beacon UDP error:", err);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        socket.off("error", onError);
        reject(err);
      };
      socket.once("error", onError);
      const bindHost = this.iface.bindAddress ?? "0.0.0.0";
      socket.bind(this.port, bindHost, () => {
        socket.off("error", onError);
        try {
          if (this.iface.multicast) {
            socket.setMulticastTTL(2);
            socket.setMulticastLoopback(true);
            socket.addMembership(this.iface.broadcast);
          } else {
            socket.setBroadcast(true);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  publish(payload: Buffer): void {
    this.transmit = payload;
    this.sendBeacon();
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.sendBeacon(), this.intervalMs);
  }

  stopPublishing(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.transmit = null;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopPublishing();
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = null;
  }

  private handleUdp(msg: Buffer, address: string): void {
    if (this.filter.length > msg.length) {
      return;
    }
    if (!msg.subarray(0, this.filter.length).equals(this.filter)) {
      return;
    }
    if (this.transmit && msg.equals(this.transmit)) {
      return;
    }
    this.emit("beacon", { address, frame: Buffer.from(msg) } satisfies BeaconMessage);
  }

  private sendBeacon(): void {
    if (!this.socket || !this.transmit) {
      return;
    }
    this.socket.send(this.transmit, this.port, this.iface.broadcast, (err) => {
      if (err) {
        this.logger.debug("Beacon send failed:", err.message);
      }
    });
  }
}
