import { describe, expect, it, vi } from 'vitest';
import { sendDataToAngularJs } from '../../src/utils/ui.helpers';

describe('sendDataToAngularJs', () => {
  it('sends event payload to window webContents', () => {
    const send = vi.fn();
    const window = { webContents: { send } } as unknown as Electron.BrowserWindow;

    sendDataToAngularJs(window, 'devices-updated', [{ uuid: '1' }]);

    expect(send).toHaveBeenCalledWith('devices-updated', [{ uuid: '1' }]);
  });

  it('swallows errors when window is unavailable', () => {
    const window = {
      webContents: {
        send: () => {
          throw new Error('destroyed');
        },
      },
    } as unknown as Electron.BrowserWindow;

    expect(() => sendDataToAngularJs(window, 'event', {})).not.toThrow();
  });
});
