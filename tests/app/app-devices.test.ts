import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ipcHandleHandlers } from '../setup';

const busCallbacks: {
  error?: (error: string) => void;
  connected?: (connected: boolean) => void;
  updating?: (updating: boolean) => void;
  message?: (peer: unknown, message: unknown) => void;
  peerConnected?: (peer: unknown) => void;
  peerDisconnected?: (peer: unknown) => void;
} = {};

vi.mock('../../src/cleepbus/cleepbus', () => ({
  cleepbus: {
    setCleepbusCallbacks: (
      error: (error: string) => void,
      connected: (connected: boolean) => void,
      updating: (updating: boolean) => void,
      message: (peer: unknown, message: unknown) => void,
      peerConnected: (peer: unknown) => void,
      peerDisconnected: (peer: unknown) => void,
    ) => {
      busCallbacks.error = error;
      busCallbacks.connected = connected;
      busCallbacks.updating = updating;
      busCallbacks.message = message;
      busCallbacks.peerConnected = peerConnected;
      busCallbacks.peerDisconnected = peerDisconnected;
    },
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(async () => undefined),
    getBusStats: vi.fn(() => ({ peers: 2, queuedEvents: 0, droppedMessages: 0, processedEvents: 0 })),
  },
}));

// Avoid real OS probing (Windows PowerShell Get-NetRoute can exceed the 5s test timeout on CI).
vi.mock('../../src/pyre/iface', () => ({
  selectInterface: vi.fn(() => ({
    name: 'eth0',
    address: '192.168.1.10',
    broadcast: '192.168.1.255',
    multicast: true,
  })),
  listNetworkInterfaces: vi.fn(() => [
    {
      name: 'eth0',
      address: '192.168.1.10',
      usableForBus: true,
      onDefaultRoute: true,
    },
  ]),
}));

describe('AppDevices', () => {
  let appDevices: typeof import('../../src/app-devices').appDevices;
  const send = vi.fn();
  const window = {
    isDestroyed: () => false,
    webContents: {
      on: vi.fn((_event: string, cb: () => void) => cb()),
      once: vi.fn((_event: string, cb: () => void) => cb()),
      send,
    },
  } as unknown as Electron.BrowserWindow;

  beforeAll(async () => {
    ({ appDevices } = await import('../../src/app-devices'));
    appDevices.configure(window);
  });

  it('configure starts bus and exposes get-ui-state ipc', async () => {
    send.mockClear();
    busCallbacks.connected?.(true);
    busCallbacks.peerConnected?.({
      uuid: 'device-1',
      hostname: 'pi',
      ip: '192.168.1.10',
      macs: ['aa:bb'],
      cleepdesktop: false,
      online: true,
    });

    expect(send).toHaveBeenCalledWith('devices-updated', expect.any(Array));
    const deviceUpdates = send.mock.calls
      .filter((call) => call[0] === 'devices-updated')
      .map((call) => call[1] as Array<{ uuid: string }>);
    expect(deviceUpdates.some((devices) => devices.some((device) => device.uuid === 'device-1'))).toBe(true);

    const state = await ipcHandleHandlers.get('devices-get-ui-state')({});
    expect(state).toMatchObject({ ok: true });
    expect(state.data.busConnected).toBe(true);
    expect(state.data.devices.some((device: { uuid: string }) => device.uuid === 'device-1')).toBe(true);

    send.mockClear();
    busCallbacks.peerDisconnected?.({
      uuid: 'device-1',
      hostname: 'pi',
      ip: '192.168.1.10',
      macs: ['aa:bb'],
      cleepdesktop: false,
      online: true, // bus may still carry stale online; handler must force offline
    });

    const afterDisconnect = send.mock.calls.find((call) => call[0] === 'devices-updated')?.[1] as Array<{
      uuid: string;
      online: boolean;
    }>;
    expect(afterDisconnect?.find((device) => device.uuid === 'device-1')?.online).toBe(false);
    expect(send).toHaveBeenCalledWith(
      'devices-message',
      expect.objectContaining({
        message: expect.objectContaining({ event: 'device.disconnected' }),
      }),
    );

    expect(ipcHandleHandlers.get('devices-delete-device')).toBeTypeOf('function');
  });

  it('marks devices offline when message bus disconnects', () => {
    send.mockClear();
    busCallbacks.peerConnected?.({
      uuid: 'device-offline-test',
      hostname: 'pi',
      ip: '192.168.1.20',
      macs: [],
      cleepdesktop: false,
      online: true,
    });
    send.mockClear();

    busCallbacks.connected?.(false);

    expect(send).toHaveBeenCalledWith('devices-updated', expect.any(Array));
    const devices = send.mock.calls.find((call) => call[0] === 'devices-updated')?.[1] as Array<{ uuid: string; online: boolean }>;
    expect(devices?.find((device) => device.uuid === 'device-offline-test')?.online).toBe(false);
  });

  it('includes hasAuthStored when pushing devices-updated after peer connect', async () => {
    const { appVault } = await import('../../src/app-vault');
    const { deviceAuthVaultKey } = await import('../../src/app-auth');
    const { USER_DATA_DIR } = await import('../setup');
    const fs = await import('fs');
    const path = await import('path');

    const vault = appVault as unknown as { configured: boolean; vaultRoot: string | null; dek: Buffer | null; meta: unknown; entries: Map<string, unknown> };
    vault.configured = false;
    vault.vaultRoot = null;
    vault.dek = null;
    vault.meta = null;
    vault.entries = new Map();
    const authVaultDir = path.join(USER_DATA_DIR, 'app-devices-vault');
    fs.mkdirSync(authVaultDir, { recursive: true });
    fs.rmSync(path.join(authVaultDir, 'vault'), { recursive: true, force: true });
    appVault.configure({ getPath: () => authVaultDir } as unknown as Electron.App);
    appVault.enable('test-pass-123');
    appVault.putSecret(deviceAuthVaultKey('device-with-vault-auth'), {
      account: 'a',
      password: 'b',
      host: '192.168.1.9',
      deviceUuid: 'device-with-vault-auth',
    });

    send.mockClear();
    busCallbacks.peerConnected?.({
      uuid: 'device-with-vault-auth',
      hostname: 'cleepdev4',
      ip: '192.168.1.9',
      port: 80,
      macs: [],
      cleepdesktop: false,
      online: true,
      auth: true,
    });

    const devices = send.mock.calls.find((call) => call[0] === 'devices-updated')?.[1] as Array<{
      uuid: string;
      hasAuthStored?: boolean;
    }>;
    expect(devices?.find((device) => device.uuid === 'device-with-vault-auth')?.hasAuthStored).toBe(true);
  });

  it('publishes peer connect/disconnect into the monitoring feed', () => {
    send.mockClear();
    const peer = {
      uuid: 'device-monitor-test',
      hostname: 'livingroom',
      ip: '192.168.1.42',
      port: 80,
      macs: [],
      cleepdesktop: false,
      online: true,
    };

    busCallbacks.peerConnected?.(peer);
    expect(send).toHaveBeenCalledWith(
      'devices-message',
      expect.objectContaining({
        peerInfos: expect.objectContaining({ uuid: 'device-monitor-test' }),
        message: expect.objectContaining({
          event: 'device.connected',
          sender: 'livingroom',
          params: expect.objectContaining({ ip: '192.168.1.42', online: true }),
        }),
      }),
    );

    send.mockClear();
    busCallbacks.peerDisconnected?.({ ...peer, online: false });
    expect(send).toHaveBeenCalledWith(
      'devices-message',
      expect.objectContaining({
        message: expect.objectContaining({
          event: 'device.disconnected',
          params: expect.objectContaining({ online: false }),
        }),
      }),
    );
  });

  it('forwards message-bus error/connected/updating/message events', () => {
    send.mockClear();
    busCallbacks.error?.('bus down');
    busCallbacks.connected?.(true);
    busCallbacks.updating?.(true);
    busCallbacks.message?.(
      { uuid: 'p1', hostname: 'h', ip: '1.1.1.1', macs: [], cleepdesktop: false, online: true },
      { sender: 'system', params: {}, startup: false },
    );

    expect(send).toHaveBeenCalledWith('devices-message-bus-error', 'bus down');
    expect(send).toHaveBeenCalledWith('devices-message-bus-connected', true);
    expect(send).toHaveBeenCalledWith('devices-message-bus-updating', true);
    expect(send).toHaveBeenCalledWith(
      'devices-message',
      expect.objectContaining({
        peerInfos: expect.objectContaining({ uuid: 'p1' }),
        message: expect.objectContaining({ sender: 'system' }),
      }),
    );
  });

  it('deletes a known device through ipc', async () => {
    busCallbacks.peerConnected?.({
      uuid: 'device-to-delete',
      hostname: 'gone',
      ip: '192.168.1.11',
      macs: [],
      cleepdesktop: false,
      online: true,
    });

    const result = await ipcHandleHandlers.get('devices-delete-device')({}, 'device-to-delete');
    expect(result).toEqual({ ok: true, data: null });

    const missing = await ipcHandleHandlers.get('devices-delete-device')({}, 'missing-device');
    expect(missing).toMatchObject({
      ok: false,
      error: { code: 'DEVICE_NOT_FOUND' },
    });
  });

  it('stop delegates to cleepbus', async () => {
    const { cleepbus } = await import('../../src/cleepbus/cleepbus');
    appDevices.stop();
    expect(cleepbus.stop).toHaveBeenCalled();
  });

  it('exposes network interface ipc handlers', async () => {
    const { cleepbus } = await import('../../src/cleepbus/cleepbus');
    const getConfig = ipcHandleHandlers.get('bus-get-network-config');
    expect(getConfig).toBeTypeOf('function');

    const config = await getConfig!({});
    expect(config).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          selectedInterface: expect.any(String),
          activeInterface: expect.objectContaining({ name: expect.any(String), address: expect.any(String) }),
          interfaces: expect.any(Array),
          peerCount: 2,
          busConnected: expect.any(Boolean),
        }),
      }),
    );

    const setInterface = ipcHandleHandlers.get('bus-set-network-interface');
    const updated = await setInterface!({}, '');
    expect(cleepbus.restart).toHaveBeenCalled();
    expect(updated.ok).toBe(true);
    expect(updated.data.selectedInterface).toBe('');
  });
});
