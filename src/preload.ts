import { contextBridge, ipcRenderer } from 'electron';
import {
  assertInvokeChannel,
  assertReceiveChannel,
  assertSendChannel,
  type InvokeChannel,
  type ReceiveChannel,
  type SendChannel,
} from './ipc/ipc-channels';
import type {
  InvokeRequest,
  InvokeResponse,
  ReceiveArgs,
  SendPayload,
} from './ipc/ipc-contract';

type InvokeArgs<C extends InvokeChannel> = InvokeRequest<C> extends void
  ? []
  : [InvokeRequest<C>];

type SendArgs<C extends SendChannel> = SendPayload<C> extends void ? [] : [SendPayload<C>];

export type IpcUnsubscribe = () => void;

/**
 * Thin bridge exposed to the AngularJS renderer.
 * No Node/Electron APIs leak into window except this allowlisted surface.
 *
 * Channel names + payloads are defined in ipc/ipc-contract.ts.
 */
const cleepBridge = {
  ipc: {
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
  },
};

contextBridge.exposeInMainWorld('cleep', cleepBridge);
