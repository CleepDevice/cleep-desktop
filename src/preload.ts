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
     * Listener signature matches the old electron.service helper: (_event, ...args).
     * The real IpcRendererEvent is not forwarded (not cloneable across the bridge).
     */
    on<C extends ReceiveChannel>(
      channel: C,
      listener: (event: null, ...args: ReceiveArgs<C>) => void,
    ): void {
      assertReceiveChannel(channel);
      ipcRenderer.on(channel, (_event, ...args: unknown[]) => {
        listener(null, ...(args as ReceiveArgs<C>));
      });
    },
  },
};

contextBridge.exposeInMainWorld('cleep', cleepBridge);
