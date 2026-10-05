import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnterEvent, ExitEvent, ShoutEvent } from '../../src/pyre';

async function flushBusQueue(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const { MockPyre, pyreInstances, mockState } = vi.hoisted(() => {
  class MiniEmitter {
    private listeners = new Map<string | symbol, Array<(...args: unknown[]) => void>>();

    on(event: string | symbol, listener: (...args: unknown[]) => void): this {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
      return this;
    }

    emit(event: string | symbol, ...args: unknown[]): boolean {
      const list = this.listeners.get(event) ?? [];
      for (const listener of list) {
        listener(...args);
      }
      return list.length > 0;
    }
  }

  const instances: MiniEmitter[] = [];
  const state = {
    startImpl: async (): Promise<void> => undefined,
  };

  class MockPyreClass extends MiniEmitter {
    setHeader = vi.fn();
    join = vi.fn(async () => undefined);
    start = vi.fn(async () => state.startImpl());
    stop = vi.fn(async () => undefined);
    shout = vi.fn(async () => undefined);
    endpoint = vi.fn(() => 'tcp://192.168.1.10:12345');

    constructor() {
      super();
      instances.push(this);
    }
  }

  return { MockPyre: MockPyreClass, pyreInstances: instances, mockState: state };
});

vi.mock('../../src/pyre', () => ({
  Pyre: MockPyre,
}));

vi.mock('../../src/cleepbus/mac-addresses', async () => {
  const actual = await vi.importActual<typeof import('../../src/cleepbus/mac-addresses')>(
    '../../src/cleepbus/mac-addresses',
  );
  return {
    ...actual,
    getMacAddresses: vi.fn(() => ['AA:BB:CC:DD:EE:FF']),
  };
});

type MockPyreInstance = InstanceType<typeof MockPyre> & {
  setHeader: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  shout: ReturnType<typeof vi.fn>;
  endpoint: ReturnType<typeof vi.fn>;
};

describe('Cleepbus', () => {
  let Cleepbus: typeof import('../../src/cleepbus/cleepbus').Cleepbus;
  let CLEEPBUS_VERSION: string;
  let cleepbus: InstanceType<typeof import('../../src/cleepbus/cleepbus').Cleepbus>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    pyreInstances.length = 0;
    mockState.startImpl = async (): Promise<void> => undefined;
    const mod = await import('../../src/cleepbus/cleepbus');
    Cleepbus = mod.Cleepbus;
    CLEEPBUS_VERSION = mod.CLEEPBUS_VERSION;
    cleepbus = new Cleepbus();
  });

  it('reports built-in version and never needs external updates', async () => {
    expect(cleepbus.getInstalledVersion()).toBe(CLEEPBUS_VERSION);
    await expect(cleepbus.checkForUpdates()).resolves.toEqual({ updateAvailable: false });
    await expect(cleepbus.checkForUpdates(true)).resolves.toEqual({ updateAvailable: false });
  });

  it('stores callbacks and stops safely without pyre node', () => {
    cleepbus.setUpdateCallbacks(vi.fn(), vi.fn());
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    expect(() => cleepbus.stop()).not.toThrow();
    expect(() => cleepbus.sendMessage('ping')).not.toThrow();
  });

  it('starts pyre node with CLEEP headers and signals connected', async () => {
    const connected = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), connected, vi.fn(), vi.fn(), vi.fn(), vi.fn());

    await cleepbus.start();

    const pyre = pyreInstances[0] as MockPyreInstance;
    expect(pyre).toBeTruthy();
    expect(pyre.join).toHaveBeenCalledWith('CLEEP');
    expect(pyre.start).toHaveBeenCalled();
    expect(pyre.setHeader).toHaveBeenCalledWith('cleepdesktop', '1');
    expect(pyre.setHeader).toHaveBeenCalledWith('macs', JSON.stringify(['AA:BB:CC:DD:EE:FF']));
    expect(connected).toHaveBeenCalledWith(true);
  });

  it('dispatches peer connected/disconnected and message events', async () => {
    const peerConnected = vi.fn();
    const peerDisconnected = vi.fn();
    const messageResponse = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), messageResponse, peerConnected, peerDisconnected);

    await cleepbus.start();
    const pyre = pyreInstances[0] as MockPyreInstance;

    const enter: EnterEvent = {
      type: 'ENTER',
      peerUuid: 'peer-1',
      peerName: 'CLEEP',
      endpoint: 'tcp://10.0.0.5:9999',
      headers: {
        uuid: 'device-uuid',
        hostname: 'pi-kitchen',
        port: '80',
        ssl: '0',
        auth: '0',
        cleepdesktop: '0',
        macs: JSON.stringify(['11:22:33:44:55:66', 'aa:bb:cc:dd:ee:ff']),
        version: '0.0.30',
        apps: 'audio,network',
      },
    };
    pyre.emit('ENTER', enter);
    await flushBusQueue();

    expect(peerConnected).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'device-uuid',
        hostname: 'pi-kitchen',
        ip: '10.0.0.5',
        ident: 'peer-1',
        online: true,
        cleepdesktop: false,
        macs: ['11:22:33:44:55:66', 'AA:BB:CC:DD:EE:FF'],
        extra: expect.objectContaining({
          configured: true,
          version: '0.0.30',
          apps: ['audio', 'network'],
        }),
      }),
    );

    const shout: ShoutEvent = {
      type: 'SHOUT',
      peerUuid: 'peer-1',
      peerName: 'CLEEP',
      group: 'CLEEP',
      content: [Buffer.from(JSON.stringify({ event: 'system.ready', sender: 'system', params: {}, startup: true }))],
    };
    pyre.emit('SHOUT', shout);
    await flushBusQueue();
    expect(messageResponse).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'device-uuid' }),
      expect.objectContaining({ event: 'system.ready', sender: 'system', startup: true }),
    );

    const exit: ExitEvent = { type: 'EXIT', peerUuid: 'peer-1', peerName: 'CLEEP' };
    pyre.emit('EXIT', exit);
    await flushBusQueue();
    expect(peerDisconnected).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'device-uuid', online: false }));
  });

  it('ignores other cleep-desktop peers and foreign buses', async () => {
    const peerConnected = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), vi.fn(), peerConnected, vi.fn());
    await cleepbus.start();
    const pyre = pyreInstances[0] as MockPyreInstance;

    pyre.emit('ENTER', {
      type: 'ENTER',
      peerUuid: 'desk-1',
      peerName: 'CLEEP',
      endpoint: 'tcp://10.0.0.2:1',
      headers: {
        uuid: 'desk',
        hostname: 'laptop',
        port: '80',
        cleepdesktop: '1',
        macs: '[]',
      },
    } satisfies EnterEvent);

    pyre.emit('ENTER', {
      type: 'ENTER',
      peerUuid: 'other',
      peerName: 'CHAT',
      endpoint: 'tcp://10.0.0.3:1',
      headers: { uuid: 'x', hostname: 'y', macs: '[]' },
    } satisfies EnterEvent);

    await flushBusQueue();
    expect(peerConnected).not.toHaveBeenCalled();
  });

  it('sendMessage shouts when running and stop tears down pyre', async () => {
    const connected = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), connected, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    await cleepbus.start();
    const pyre = pyreInstances[0] as MockPyreInstance;

    cleepbus.sendMessage('hello');
    expect(pyre.shout).toHaveBeenCalledWith('CLEEP', 'hello');

    cleepbus.stop();
    expect(pyre.stop).toHaveBeenCalled();
    expect(connected).toHaveBeenCalledWith(false);
  });

  it('reports startup errors through callback and schedules restart', async () => {
    vi.useFakeTimers();
    const errorCb = vi.fn();
    cleepbus.setCleepbusCallbacks(errorCb, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    mockState.startImpl = async () => {
      throw new Error('bind failed');
    };

    await cleepbus.start();
    expect(errorCb).toHaveBeenCalledWith('bind failed');

    mockState.startImpl = async (): Promise<void> => undefined;
    await vi.advanceTimersByTimeAsync(1000);
    expect(pyreInstances.length).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('restarts after unexpected STOP', async () => {
    vi.useFakeTimers();
    const connected = vi.fn();
    cleepbus.setCleepbusCallbacks(vi.fn(), connected, vi.fn(), vi.fn(), vi.fn(), vi.fn());
    await cleepbus.start();
    const firstCount = pyreInstances.length;

    (pyreInstances[0] as MockPyreInstance).emit('STOP');
    expect(connected).toHaveBeenCalledWith(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pyreInstances.length).toBeGreaterThan(firstCount);
    vi.useRealTimers();
  });

  it('does not restart after intentional stop', async () => {
    vi.useFakeTimers();
    cleepbus.setCleepbusCallbacks(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
    await cleepbus.start();
    const countAfterStart = pyreInstances.length;

    cleepbus.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(pyreInstances.length).toBe(countAfterStart);
    vi.useRealTimers();
  });
});

describe('mac-addresses', () => {
  it('normalizes MAC addresses to uppercase', async () => {
    const { normalizeMac, normalizeMacList } = await import('../../src/cleepbus/mac-addresses');
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMacList(['aa:bb:cc:dd:ee:ff', '11:22:33:44:55:66', 'AA:BB:CC:DD:EE:FF'])).toEqual([
      'AA:BB:CC:DD:EE:FF',
      '11:22:33:44:55:66',
    ]);
  });
});
