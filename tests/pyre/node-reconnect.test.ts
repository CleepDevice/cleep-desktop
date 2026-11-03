import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const closeMock = vi.fn();
const connectMock = vi.fn();

vi.mock('../../src/pyre/zmq', () => ({
  Dealer: class {
    routingId: Buffer | null = null;
    onClose: (() => void) | null = null;
    connect = connectMock;
    send = sendMock;
    close = closeMock;
  },
  Router: class {},
}));

describe('pyre node peer reconnect', () => {
  beforeEach(() => {
    sendMock.mockReset();
    closeMock.mockReset();
    connectMock.mockReset();
    sendMock.mockResolvedValue(undefined);
  });

  it('reopens mailbox on beacon after send failure without emitting EXIT', async () => {
    const { PyreNode } = await import('../../src/pyre/node');
    const { encodeBeacon } = await import('../../src/pyre/beacon-codec');
    const { bytesToUuid } = await import('../../src/pyre/uuid');

    const events: Array<{ type: string }> = [];
    const node = new PyreNode({ name: 'desktop' }, (event) => events.push(event), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    // Avoid binding real sockets; recvBeacon only needs endpoint + peer map.
    (node as unknown as { endpoint: string }).endpoint = 'tcp://192.168.1.2:9999';

    const peerUuidBytes = Buffer.alloc(16, 7);
    const peerUuid = bytesToUuid(peerUuidBytes);
    const endpoint = 'tcp://192.168.1.50:5600';
    const recvBeacon = (
      node as unknown as { recvBeacon: (msg: { address: string; frame: Buffer }) => void }
    ).recvBeacon.bind(node);

    recvBeacon({
      address: '192.168.1.50',
      frame: encodeBeacon(peerUuidBytes, 5600),
    });
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalled());

    const peer = node.peers.get(peerUuid);
    expect(peer).toBeTruthy();
    expect(peer?.connected).toBe(true);
    const hellosAfterCreate = sendMock.mock.calls.length;

    peer!.disconnect();
    expect(peer!.connected).toBe(false);
    expect(events.filter((e) => e.type === 'EXIT')).toHaveLength(0);

    recvBeacon({
      address: '192.168.1.50',
      frame: encodeBeacon(peerUuidBytes, 5600),
    });
    await vi.waitFor(() => expect(sendMock.mock.calls.length).toBeGreaterThan(hellosAfterCreate));

    expect(peer!.connected).toBe(true);
    expect(peer!.endpoint).toBe(endpoint);
    expect(events.filter((e) => e.type === 'EXIT')).toHaveLength(0);

    // Beacon presence must not reset evasiveAt (variant A).
    peer!.refresh();
    const evasiveAt = peer!.evasiveAt;
    recvBeacon({
      address: '192.168.1.50',
      frame: encodeBeacon(peerUuidBytes, 5600),
    });
    expect(peer!.evasiveAt).toBe(evasiveAt);
    expect(peer!.expiredAt).toBeGreaterThan(performance.now());
  });
});
