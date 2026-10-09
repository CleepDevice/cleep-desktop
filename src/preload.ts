import { contextBridge, ipcRenderer } from 'electron';
import {
  assertInvokeChannel,
  assertReceiveChannel,
  assertSendChannel,
  type InvokeChannel,
  type ReceiveChannel,
  type SendChannel,
} from './ipc/ipc-channels';
import type { InvokeResponse, ReceiveArgs } from './ipc/ipc-contract';
import {
  createCleepApi,
  type InvokeArgs,
  type IpcUnsubscribe,
  type SendArgs,
} from './ipc/ipc-api';

export type { IpcUnsubscribe };

/**
 * Thin bridge exposed to the AngularJS renderer.
 * Prefer window.cleep.api (semantic). window.cleep.ipc remains the low-level allowlisted surface.
 */
const ipc = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<InvokeResponse<C>> {
    assertInvokeChannel(channel);
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResponse<C>>;
  },

  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
    assertSendChannel(channel);
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Subscribe to a main→renderer channel.
   * Returns an unsubscribe function (remove this listener only).
   * Listener signature: (_event, ...args) — IpcRendererEvent is not forwarded.
   */
  on<C extends ReceiveChannel>(
    channel: C,
    listener: (event: null, ...args: ReceiveArgs<C>) => void,
  ): IpcUnsubscribe {
    assertReceiveChannel(channel);
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      listener(null, ...(args as ReceiveArgs<C>));
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

const cleepBridge = {
  ipc,
  api: createCleepApi(ipc),
};

contextBridge.exposeInMainWorld('cleep', cleepBridge);
