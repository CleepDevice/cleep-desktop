import { contextBridge, ipcRenderer } from 'electron';
import { assertInvokeChannel, assertReceiveChannel, assertSendChannel } from './ipc-channels';

/**
 * Thin bridge exposed to the AngularJS renderer.
 * No Node/Electron APIs leak into window except this allowlisted surface.
 */
const cleepBridge = {
  ipc: {
    invoke(channel: string, data?: unknown): Promise<unknown> {
      assertInvokeChannel(channel);
      return ipcRenderer.invoke(channel, data);
    },

    send(channel: string, data?: unknown): void {
      assertSendChannel(channel);
      ipcRenderer.send(channel, data);
    },

    /**
     * Subscribe to a main→renderer channel.
     * Listener signature matches the old electron.service helper: (_event, ...args).
     * The real IpcRendererEvent is not forwarded (not cloneable across the bridge).
     */
    on(channel: string, listener: (event: null, ...args: unknown[]) => void): void {
      assertReceiveChannel(channel);
      ipcRenderer.on(channel, (_event, ...args: unknown[]) => {
        listener(null, ...args);
      });
    },
  },
};

contextBridge.exposeInMainWorld('cleep', cleepBridge);
