import type { OutgoingZreMessage } from "./codec";
import type { Peer } from "./peer";
import { wrapStatus } from "./util";

export class Group {
  readonly peers = new Map<string, Peer>();

  constructor(readonly name: string) {}

  join(peer: Peer): void {
    this.peers.set(peer.uuid, peer);
    peer.status = wrapStatus(peer.status + 1);
  }

  leave(peer: Peer): void {
    this.peers.delete(peer.uuid);
    peer.status = wrapStatus(peer.status + 1);
  }

  async send(message: OutgoingZreMessage): Promise<void> {
    await Promise.all([...this.peers.values()].map((peer) => peer.send(message)));
  }
}
