# Cleepbus (embedded pyre-ts)

In-process CLEEP message bus used by Cleep Desktop. It wraps `src/pyre`
(TypeScript ZRE stack) instead of an external cleepbus binary.

Device-side discovery uses **pyre-gevent** (Python). Both stacks implement
ZeroMQ RFC 36 (ZRE) and must stay behaviorally aligned for long-uptime LAN use.

## What was hardened (0.1.1)

Desktop (`pyre` + `cleepbus`):

- Mailbox send failures no longer force immediate peer expiry; beacons can refresh
  timers while TCP is reopened.
- Dealer connect/close races no longer deadlock `Peer.sendQueue` (ready promise
  always settles; reconnect cannot be killed by a stale send failure).
- TCP drop notifies the peer (`connected=false`) so the next beacon re-HELLOS.
- UDP beacons only extend expiry (`refreshExpiry`), not evasive — dead TCP still gets PING.
- Peer evasive/expired deadlines use monotonic `performance.now()` (wall clock only for sleep jump).
- Interface selection rejects `127.0.0.1`, skips common virtual NICs, falls back
  when the default route is a VPN, and prefers RFC1918 over CGNAT/`100.64`.
- Cleepbus restarts on OS resume and network interface signature changes.
- EXIT+ENTER for the same ZRE `peerUuid` in one event batch no longer flicker the
  UI offline.

Devices (`pyre-gevent`):

- Reconnect mailbox + HELLO when disconnected or endpoint changes (beacons).
- `remove_peer` closes the DEALER immediately; `last_endpoint` for purge.
- Peer liveness and beacon intervals use `time.monotonic()` (NTP / no-RTC Pi).
- UDP beacons only extend expiry (`refresh_expiry`), not evasive — dead TCP still gets PING.
- JOIN/LEAVE status mismatch logs and resyncs instead of killing the actor.

## Remaining improvements (not blocking)

### Network / discovery

1. **Hot rebind without full node restart**  
   Today Desktop restarts the whole pyre node on iface change. A lighter path
   could rebind UDP + re-advertise `endpoint` without tearing down peer maps.

2. **Beacon on every usable LAN broadcast**  
   Multi-homed hosts might need simultaneous beacons on several subnets, not a
   single chosen iface.

3. **Explicit “network not ready” UX**  
   Auto-restart backoff works, but Preferences could show “waiting for LAN…”
   when start fails for no usable iface.

### Transport

4. **Tunable TCP keepalive**  
   Default OS keepalive can leave half-open sockets for a long time. Shorter
   keepalive / user timeout would detect dead peers without waiting for a send.

5. **Propagate send errors to `whisper()` callers**  
   Soft: `sendCommandToPeer` still hits the full timeout if the mailbox dies
   after queueing; surfacing the disconnect would fail fast.

6. **WHISPER under queue pressure**  
   Non-critical queue drop can discard `external.command.response`. Prefer
   elevating command responses to critical, or a dedicated reply path.

### Protocol / lifecycle

7. **One-way UDP asymmetry after roam**  
   If only one direction of beacons works, ZRE can leave a zombie “online” peer.
   Mitigations: dual-homed beacons, or application-level heartbeat over TCP.
   Note: beacons already call `refreshExpiry()` only (not full `refresh()`), so a
   dead TCP mailbox still receives evasive PINGs while UDP prevents hard expiry.

8. ~~**Full monotonic timers on Desktop**~~ — done (`monoNow()` / `performance.now()`).

9. **Python: drain more inbox/beacon frames per loop iteration**  
   After a short freeze, processing one frame then reaping can expire a peer
   whose traffic is still buffered.

### Product / ops

10. **Soak tests**  
    Overnight multi-device + Desktop sleep/wake + VPN toggle should be part of
    release checks for Desktop and CleepOS images that ship pyre-gevent.

11. **Structured metrics**  
    Counters for reconnects, wall-clock jumps, iface restarts, and dropped
    whispers would make residual false-offline reports actionable.

12. **TCP keepalive probe interval**  
    Dealer sockets enable keepalive but leave the OS default idle probe (~2 h).
    A shorter probe would detect half-open peers without waiting for a send.

13. **Beacon UDP hard failures**  
    `beacon.ts` only logs send/recv errors; recovery relies on cleepbus network
    watch / resume restart rather than emitting STOP from pyre.

## Related paths

| Role | Path |
|------|------|
| Desktop bus | `src/cleepbus/` |
| Desktop ZRE | `src/pyre/` |
| Device ZRE | `pyre-gevent` (sibling repo / dependency) |
