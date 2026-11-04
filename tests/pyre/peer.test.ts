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
}));

vi.mock('../../src/pyre/codec', () => ({
  encodeZre: vi.fn(() => [Buffer.from('frame')]),
  ZreMsgId: { HELLO: 1, WHISPER: 2, SHOUT: 3, PING: 6 },
}));

describe('pyre Peer mailbox recovery', () => {
  beforeEach(() => {
    sendMock.mockReset();
    closeMock.mockReset();
    connectMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it('refreshExpiry extends expiredAt without touching evasiveAt', async () => {
    const { Peer, PEER_EVASIVE_MS, PEER_EXPIRED_MS } = await import('../../src/pyre/peer');
    const peer = new Peer('peer-uuid', Buffer.alloc(16, 4), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const now = 50_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    peer.refresh();
    expect(peer.evasiveAt).toBe(now + PEER_EVASIVE_MS);
    expect(peer.expiredAt).toBe(now + PEER_EXPIRED_MS);

    const evasiveAt = peer.evasiveAt;
    vi.spyOn(performance, 'now').mockReturnValue(now + 3_000);
    peer.refreshExpiry();
    expect(peer.evasiveAt).toBe(evasiveAt);
    expect(peer.expiredAt).toBe(now + 3_000 + PEER_EXPIRED_MS);
  });

  it('keeps expiry timers after send failure and preserves lastEndpoint', async () => {
    const { Peer, PEER_EXPIRED_MS } = await import('../../src/pyre/peer');
    const peer = new Peer('peer-uuid', Buffer.alloc(16, 1), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    peer.connect('tcp://192.168.1.10:5600');
    peer.refresh();
    const expiredAt = peer.expiredAt;
    expect(expiredAt).toBeGreaterThan(performance.now());
    expect(peer.lastEndpoint).toBe('tcp://192.168.1.10:5600');

    sendMock.mockRejectedValueOnce(new Error('dealer closed'));
    // Protocol traffic (PING) still swallows the error after disconnect.
    await peer.send({ id: 6 } as never);

    expect(peer.connected).toBe(false);
    expect(peer.endpoint).toBe('');
    expect(peer.lastEndpoint).toBe('tcp://192.168.1.10:5600');
    // Must NOT force immediate expire (previous bug: expiredAt = 0 → false EXIT).
    expect(peer.expiredAt).toBe(expiredAt);
    expect(peer.expiredAt).toBeGreaterThan(performance.now());
    expect(peer.expiredAt - performance.now()).toBeLessThanOrEqual(PEER_EXPIRED_MS);
  });

  it('rejects WHISPER send failures so callers can fail fast', async () => {
    const { Peer } = await import('../../src/pyre/peer');
    const peer = new Peer('peer-uuid', Buffer.alloc(16, 5), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    peer.connect('tcp://192.168.1.10:5600');
    sendMock.mockRejectedValueOnce(new Error('dealer closed'));
    await expect(peer.send({ id: 2, content: [Buffer.from('x')] } as never)).rejects.toThrow(
      'dealer closed',
    );
    expect(peer.connected).toBe(false);

    await expect(peer.send({ id: 2, content: [Buffer.from('y')] } as never)).rejects.toThrow(
      /not connected/,
    );
  });

  it('resets ZRE sequences when reconnecting the mailbox', async () => {
    const { Peer } = await import('../../src/pyre/peer');
    const peer = new Peer('peer-uuid', Buffer.alloc(16, 2), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    peer.connect('tcp://192.168.1.10:5600');
    await peer.send({ id: 6 } as never);
    expect(peer.sentSequence).toBe(1);

    peer.disconnect();
    peer.connect('tcp://192.168.1.10:5600');
    expect(peer.sentSequence).toBe(0);
    expect(peer.wantSequence).toBe(0);
  });

  it('does not disconnect a newer mailbox when an older send fails', async () => {
    const { Peer } = await import('../../src/pyre/peer');
    const peer = new Peer('peer-uuid', Buffer.alloc(16, 3), {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    peer.connect('tcp://192.168.1.10:5600');
    let releaseFirst: ((err: Error) => void) | undefined;
    sendMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          releaseFirst = reject;
        }),
    );

    const first = peer.send({ id: 6 } as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(releaseFirst).toBeTypeOf('function');

    peer.disconnect();
    peer.connect('tcp://192.168.1.11:5600');
    expect(peer.connected).toBe(true);
    expect(peer.endpoint).toBe('tcp://192.168.1.11:5600');

    releaseFirst!(new Error('stale dealer'));
    await first.catch(() => undefined);
    expect(peer.connected).toBe(true);
    expect(peer.endpoint).toBe('tcp://192.168.1.11:5600');
  });
});
