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
  },
}));

describe('AppDevices', () => {
  let appDevices: typeof import('../../src/app-devices').appDevices;
  const send = vi.fn();
  const window = {
    webContents: {
      once: vi.fn((_event: string, cb: () => void) => cb()),
      send,
    },
  } as unknown as Electron.BrowserWindow;

  beforeAll(async () => {
    ({ appDevices } = await import('../../src/app-devices'));
    appDevices.configure(window);
  });

  it('configure starts bus and syncs peer connection updates', () => {
    send.mockClear();
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

    busCallbacks.peerDisconnected?.({
      uuid: 'device-1',
      hostname: 'pi',
      ip: '192.168.1.10',
      macs: ['aa:bb'],
      cleepdesktop: false,
      online: false,
    });

    expect(ipcHandleHandlers.get('devices-delete-device')).toBeTypeOf('function');
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
    expect(result).toEqual({ data: null, error: false });

    const missing = await ipcHandleHandlers.get('devices-delete-device')({}, 'missing-device');
    expect(missing).toEqual({ data: null, error: true });
  });

  it('stop delegates to cleepbus', async () => {
    const { cleepbus } = await import('../../src/cleepbus/cleepbus');
    appDevices.stop();
    expect(cleepbus.stop).toHaveBeenCalled();
  });
});
