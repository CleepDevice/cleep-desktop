import { Router } from "./zmq";
import { decodeBeacon, encodeBeacon, ZRE_DISCOVERY_PORT } from "./beacon-codec";
import { ZBeacon, type BeaconMessage } from "./beacon";
import { decodeZre, type OutgoingZreMessage, type ZreMessage, ZreMsgId } from "./codec";
import { Group } from "./group";
import { selectInterface, type IfaceInfo } from "./iface";
import { Peer } from "./peer";
import type { Headers, Logger, MessageContent, PyreEvent, PyreOptions } from "./types";
import { asBuffer, monoNow, sleep, toFrames, wrapStatus } from "./util";
import { bytesToUuid, identityFromRoutingId, randomUuid } from "./uuid";

const REAP_INTERVAL_MS = 1000;
/** Wall-clock gap larger than this between reap ticks ⇒ likely sleep/wake; reset mailboxes. */
const WALL_CLOCK_JUMP_MS = 15_000;

export class PyreNode {
  readonly uuid: string;
  readonly uuidBytes: Buffer;
  name: string;
  endpoint = "";
  port = 0;
  status = 0;
  headers: Headers = {};
  readonly ownGroups = new Set<string>();
  readonly peerGroups = new Map<string, Group>();
  readonly peers = new Map<string, Peer>();

  private inbox: Router | null = null;
  private beacon: ZBeacon | null = null;
  private iface: IfaceInfo | null = null;
  private running = false;
  private reaper: NodeJS.Timeout | null = null;
  private inboxLoop: Promise<void> | null = null;
  private lastReapWallMs = 0;
  private readonly emitEvent: (event: PyreEvent) => void;
  private readonly logger: Logger;
  private readonly options: Required<Pick<PyreOptions, "port" | "interval">> & PyreOptions;

  constructor(
    options: PyreOptions,
    emitEvent: (event: PyreEvent) => void,
    logger: Logger,
  ) {
    const id = randomUuid();
    this.uuid = id.str;
    this.uuidBytes = id.bytes;
    this.name = options.name ?? this.uuid.replace(/-/g, "").slice(0, 6);
    this.emitEvent = emitEvent;
    this.logger = logger;
    this.options = {
      port: options.port ?? ZRE_DISCOVERY_PORT,
      interval: options.interval ?? 1000,
      ...options,
    };
  }

  setName(name: string): void {
    this.name = name;
  }

  setHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  setPort(port: number): void {
    this.options.port = port;
  }

  setInterval(intervalMs: number): void {
    this.options.interval = intervalMs;
  }

  setInterface(name: string): void {
    this.options.interface = name;
  }

  setVerbose(verbose: boolean): void {
    this.logger.debug = verbose
      ? (...args: unknown[]) => console.error("[pyre-ts]", ...args)
      : () => undefined;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.iface = selectInterface(this.options.interface);
    const inbox = new Router({ linger: 0, handover: true });
    this.inbox = inbox;
    await inbox.bind("tcp://0.0.0.0:*");
    const lastEndpoint = inbox.lastEndpoint;
    if (!lastEndpoint) {
      throw new Error("Failed to bind ZRE inbox to an ephemeral TCP port");
    }
    this.port = Number(lastEndpoint.split(":").pop());
    this.endpoint = `tcp://${this.iface.address}:${this.port}`;
    this.logger.debug(`Node ${this.name} inbox ${this.endpoint} on ${this.iface.name}`);

    const beacon = new ZBeacon(this.iface, this.options.port, this.options.interval, this.logger);
    beacon.on("beacon", (msg: BeaconMessage) => {
      try {
        this.recvBeacon(msg);
      } catch (error) {
        this.logger.error("Error handling beacon:", error);
      }
    });
    await beacon.start();
    beacon.publish(encodeBeacon(this.uuidBytes, this.port));
    this.beacon = beacon;

    this.running = true;
    this.inboxLoop = this.readInbox();
    this.reaper = setInterval(() => {
      try {
        this.reap();
      } catch (error) {
        this.logger.error("Error during peer reaper:", error);
      }
    }, REAP_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (!this.running && !this.inbox) {
      return;
    }
    this.running = false;
    if (this.beacon) {
      try {
        this.beacon.publish(encodeBeacon(this.uuidBytes, 0));
        await sleep(50);
      } catch {
        // ignore publish errors during shutdown
      }
      this.beacon.close();
      this.beacon = null;
    }
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
    this.teardownPeersAndInbox();
    await this.inboxLoop?.catch((): undefined => undefined);
    this.emitEvent({ type: "STOP", peerUuid: this.uuid, peerName: this.name });
  }

  /**
   * Abort the node from inside the inbox loop without awaiting itself (avoids deadlock).
   * Emits STOP so the host can restart the bus.
   */
  private crashFromInbox(reason: string): void {
    this.logger.error(`ZRE inbox crashed: ${reason}`);
    this.running = false;
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
    if (this.beacon) {
      try {
        this.beacon.close();
      } catch {
        // ignore
      }
      this.beacon = null;
    }
    this.teardownPeersAndInbox();
    this.emitEvent({ type: "STOP", peerUuid: this.uuid, peerName: this.name });
  }

  private teardownPeersAndInbox(): void {
    for (const peer of this.peers.values()) {
      peer.disconnect();
    }
    this.peers.clear();
    try {
      this.inbox?.close();
    } catch {
      // ignore
    }
    this.inbox = null;
  }

  async join(group: string): Promise<void> {
    if (this.ownGroups.has(group)) {
      return;
    }
    this.ownGroups.add(group);
    this.status = wrapStatus(this.status + 1);
    await this.broadcast({ id: ZreMsgId.JOIN, group, status: this.status });
    this.logger.debug(`Node is joining group ${group}`);
  }

  async leave(group: string): Promise<void> {
    if (!this.ownGroups.has(group)) {
      return;
    }
    this.status = wrapStatus(this.status + 1);
    await this.broadcast({ id: ZreMsgId.LEAVE, group, status: this.status });
    this.ownGroups.delete(group);
    this.logger.debug(`Node is leaving group ${group}`);
  }

  async whisper(peerUuid: string, content: MessageContent): Promise<void> {
    const peer = this.peers.get(peerUuid);
    if (!peer) {
      return;
    }
    await peer.send({ id: ZreMsgId.WHISPER, content: toFrames(content) });
  }

  async shout(group: string, content: MessageContent): Promise<void> {
    const grp = this.peerGroups.get(group);
    if (!grp) {
      this.logger.warn(`Group ${group} not found.`);
      return;
    }
    await grp.send({ id: ZreMsgId.SHOUT, group, content: toFrames(content) });
  }

  peersByGroup(group: string): string[] {
    return [...(this.peerGroups.get(group)?.peers.keys() ?? [])];
  }

  peerAddress(peerUuid: string): string {
    return this.peers.get(peerUuid)?.endpoint ?? "";
  }

  peerHeader(peerUuid: string, name: string): string {
    return this.peers.get(peerUuid)?.headers[name] ?? "";
  }

  peerHeaders(peerUuid: string): Headers | undefined {
    const peer = this.peers.get(peerUuid);
    return peer ? { ...peer.headers } : undefined;
  }

  peerName(peerUuid: string): string {
    return this.peers.get(peerUuid)?.name ?? "";
  }

  private async broadcast(message: OutgoingZreMessage): Promise<void> {
    await Promise.all([...this.peers.values()].map((peer) => peer.send(message)));
  }

  private async readInbox(): Promise<void> {
    const inbox = this.inbox;
    if (!inbox) {
      return;
    }
    while (this.running) {
      try {
        const frames = await inbox.receive();
        try {
          this.recvPeer(frames.map((frame) => asBuffer(frame)));
        } catch (error) {
          // Keep the bus alive on a single bad frame.
          this.logger.error("Error processing peer frames:", error);
        }
      } catch (error) {
        if (!this.running) {
          return;
        }
        // Router closed / fatal I/O: stop and let the host restart.
        this.crashFromInbox(error instanceof Error ? error.message : String(error));
        return;
      }
    }
  }

  private recvBeacon(msg: BeaconMessage): void {
    const beacon = decodeBeacon(msg.frame);
    if (!beacon) {
      return;
    }
    const peerUuid = bytesToUuid(beacon.uuid);
    if (peerUuid === this.uuid) {
      return;
    }
    if (beacon.port) {
      const endpoint = `tcp://${msg.address}:${beacon.port}`;
      const peer = this.requirePeer(peerUuid, endpoint);
      // Presence only — leave evasiveAt alone so TCP PING still runs on a dead mailbox.
      peer.refreshExpiry();
    } else {
      const peer = this.peers.get(peerUuid);
      if (peer) {
        this.logger.debug(`Received 0 port beacon, removing peer ${peerUuid}`);
        this.removePeer(peer);
      }
    }
  }

  private recvPeer(frames: Buffer[]): void {
    if (frames.length < 2) {
      return;
    }
    const identity = identityFromRoutingId(frames[0]);
    if (!identity) {
      this.logger.debug("Peer identity frame empty or malformed");
      return;
    }
    const msg = decodeZre(frames.slice(1));
    if (!msg) {
      return;
    }
    const id = bytesToUuid(identity);
    let peer = this.peers.get(id);

    if (msg.id === ZreMsgId.HELLO) {
      if (peer) {
        if (peer.ready) {
          this.removePeer(peer);
        } else if (peer.endpoint === this.endpoint) {
          return;
        } else {
          // Mailbox was dropped (ready=false) without EXIT — clear stale group membership
          // before re-ENTER so JOIN events match the new HELLO group list.
          this.clearPeerGroupMembership(peer);
        }
      }
      peer = this.requirePeer(id, msg.endpoint);
      peer.ready = true;
    }

    if (!peer || !peer.ready) {
      this.logger.debug(`Peer ${id} isn't ready`);
      return;
    }
    if (peer.messagesLost(msg)) {
      this.logger.warn(`messages lost from ${peer.uuid}`);
      this.removePeer(peer);
      return;
    }

    this.handleCommand(peer, msg);
    peer.refresh();
  }

  private handleCommand(peer: Peer, msg: ZreMessage): void {
    switch (msg.id) {
      case ZreMsgId.HELLO:
        peer.name = msg.name;
        peer.headers = { ...msg.headers };
        this.emitEvent({
          type: "ENTER",
          peerUuid: peer.uuid,
          peerName: peer.name,
          headers: { ...peer.headers },
          endpoint: peer.endpoint,
        });
        this.logger.debug(`(${this.name}) ENTER name=${peer.name} endpoint=${peer.endpoint}`);
        for (const group of msg.groups) {
          this.joinPeerGroup(peer, group);
        }
        peer.status = msg.status;
        break;
      case ZreMsgId.WHISPER:
        this.emitEvent({
          type: "WHISPER",
          peerUuid: peer.uuid,
          peerName: peer.name,
          content: msg.content,
        });
        break;
      case ZreMsgId.SHOUT:
        this.emitEvent({
          type: "SHOUT",
          peerUuid: peer.uuid,
          peerName: peer.name,
          group: msg.group,
          content: msg.content,
        });
        break;
      case ZreMsgId.PING:
        void peer.send({ id: ZreMsgId.PING_OK });
        break;
      case ZreMsgId.JOIN:
        this.joinPeerGroup(peer, msg.group);
        break;
      case ZreMsgId.LEAVE:
        this.leavePeerGroup(peer, msg.group);
        break;
      case ZreMsgId.PING_OK:
        break;
    }
  }

  private requirePeer(identity: string, endpoint: string): Peer {
    let peer = this.peers.get(identity);
    if (peer) {
      // Mailbox may have been dropped on send failure while UDP beacons still refresh
      // timers — reopen and re-handshake instead of waiting for a full expire/EXIT cycle.
      const endpointChanged = Boolean(endpoint && peer.endpoint && peer.endpoint !== endpoint);
      if (!peer.connected || endpointChanged) {
        this.logger.debug(
          `(${this.name}) reconnect peer name=${peer.name} endpoint=${endpoint}` +
            `${endpointChanged ? " (endpoint changed)" : ""}`,
        );
        if (peer.connected) {
          peer.disconnect();
        }
        peer.connect(endpoint);
        this.sendHello(peer);
      }
      return peer;
    }
    for (const existing of [...this.peers.values()]) {
      if (existing.endpoint === endpoint || existing.lastEndpoint === endpoint) {
        this.removePeer(existing);
        existing.disconnect();
      }
    }
    peer = new Peer(identity, this.uuidBytes, this.logger);
    this.peers.set(identity, peer);
    peer.connect(endpoint);
    this.sendHello(peer);
    return peer;
  }

  private sendHello(peer: Peer): void {
    void peer.send({
      id: ZreMsgId.HELLO,
      endpoint: this.endpoint,
      groups: [...this.ownGroups],
      status: this.status,
      name: this.name,
      headers: { ...this.headers },
    });
  }

  private clearPeerGroupMembership(peer: Peer): void {
    for (const group of this.peerGroups.values()) {
      group.peers.delete(peer.uuid);
    }
  }

  private removePeer(peer: Peer): void {
    // Always emit EXIT (zyre/pyre behavior). ready may already be false after a mailbox
    // drop; cleepbus ignores EXIT for peer UUIDs that never ENTER'd.
    this.emitEvent({ type: "EXIT", peerUuid: peer.uuid, peerName: peer.name });
    this.logger.debug(
      `(${this.name}) EXIT name=${peer.name} endpoint=${peer.endpoint || peer.lastEndpoint}`,
    );
    this.clearPeerGroupMembership(peer);
    this.peers.delete(peer.uuid);
    peer.disconnect();
  }

  private requirePeerGroup(name: string): Group {
    let group = this.peerGroups.get(name);
    if (!group) {
      group = new Group(name);
      this.peerGroups.set(name, group);
    }
    return group;
  }

  private joinPeerGroup(peer: Peer, groupName: string): void {
    const group = this.requirePeerGroup(groupName);
    group.join(peer);
    this.emitEvent({
      type: "JOIN",
      peerUuid: peer.uuid,
      peerName: peer.name,
      group: groupName,
    });
    this.logger.debug(`(${this.name}) JOIN name=${peer.name} group=${groupName}`);
  }

  private leavePeerGroup(peer: Peer, groupName: string): void {
    this.emitEvent({
      type: "LEAVE",
      peerUuid: peer.uuid,
      peerName: peer.name,
      group: groupName,
    });
    const group = this.requirePeerGroup(groupName);
    group.leave(peer);
    this.logger.debug(`(${this.name}) LEAVE name=${peer.name} group=${groupName}`);
  }

  private reap(): void {
    // Wall clock only for sleep/NTP jump detection; peer deadlines use monoNow().
    const wallNow = Date.now();
    if (this.lastReapWallMs > 0 && wallNow - this.lastReapWallMs > WALL_CLOCK_JUMP_MS) {
      this.logger.warn(
        `(${this.name}) wall-clock jump ${wallNow - this.lastReapWallMs}ms — resetting peer mailboxes`,
      );
      for (const peer of this.peers.values()) {
        peer.disconnect();
        // Monotonic expiry is usually still valid after sleep; refresh anyway and
        // force evasive reconnect + HELLO (TCP often dies across suspend).
        peer.refreshExpiry();
        peer.evasiveAt = 0;
      }
    }
    this.lastReapWallMs = wallNow;

    const now = monoNow();
    for (const peer of [...this.peers.values()]) {
      if (now > peer.expiredAt) {
        this.logger.debug(
          `(${this.name}) peer expired name=${peer.name} endpoint=${peer.endpoint || peer.lastEndpoint}`,
        );
        this.removePeer(peer);
      } else if (now > peer.evasiveAt) {
        this.logger.debug(`(${this.name}) peer seems dead/slow name=${peer.name}`);
        const endpoint = peer.endpoint || peer.lastEndpoint;
        if (!peer.connected && endpoint) {
          // Prefer reopening the mailbox over a PING that cannot leave a dead socket.
          peer.connect(endpoint);
          this.sendHello(peer);
        } else {
          void peer.send({ id: ZreMsgId.PING });
        }
      }
    }
  }
}
