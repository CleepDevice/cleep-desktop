import { describe, expect, it, vi } from 'vitest';
import { createCleepApi, type IpcPrimitives } from '../../src/ipc/ipc-api';

function createMockIpc(): IpcPrimitives & {
  invoke: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
} {
  return {
    invoke: vi.fn(async () => ({ ok: true, data: null })),
    send: vi.fn(),
    on: vi.fn(() => () => undefined),
  };
}

describe('createCleepApi', () => {
  it('exposes domain namespaces', () => {
    const api = createCleepApi(createMockIpc());
    expect(Object.keys(api).sort()).toEqual([
      'app',
      'bus',
      'cache',
      'devices',
      'download',
      'install',
      'logger',
      'settings',
      'shell',
      'updater',
      'webview',
    ]);
  });

  it('maps semantic invokes to channel names', async () => {
    const ipc = createMockIpc();
    const api = createCleepApi(ipc);

    await api.devices.getUiState();
    await api.bus.setNetworkInterface('eth0');
    await api.install.getIsos(true);
    await api.settings.get('cleep.debug');

    expect(ipc.invoke).toHaveBeenCalledWith('devices-get-ui-state');
    expect(ipc.invoke).toHaveBeenCalledWith('bus-set-network-interface', 'eth0');
    expect(ipc.invoke).toHaveBeenCalledWith('iso-get-isos', true);
    expect(ipc.invoke).toHaveBeenCalledWith('settings-get', 'cleep.debug');
  });

  it('maps semantic sends to channel names', () => {
    const ipc = createMockIpc();
    const api = createCleepApi(ipc);

    api.install.cancel();
    api.download.start({ url: 'https://example.com/a.bin' });
    api.shell.openUrl('https://cleep.io');
    api.updater.quitAndInstall();

    expect(ipc.send).toHaveBeenCalledWith('iso-cancel-install');
    expect(ipc.send).toHaveBeenCalledWith('download-file', {
      url: 'https://example.com/a.bin',
    });
    expect(ipc.send).toHaveBeenCalledWith('open-url-in-browser', 'https://cleep.io');
    expect(ipc.send).toHaveBeenCalledWith('updater-quit-and-install');
  });

  it('maps semantic subscriptions to receive channels', () => {
    const ipc = createMockIpc();
    const api = createCleepApi(ipc);
    const listener = vi.fn();

    api.devices.onMessage(listener);
    api.install.onProgress(listener);
    api.app.onOpenPage(listener);

    expect(ipc.on).toHaveBeenCalledWith('devices-message', listener);
    expect(ipc.on).toHaveBeenCalledWith('iso-install-progress', listener);
    expect(ipc.on).toHaveBeenCalledWith('open-page', listener);
  });
});
