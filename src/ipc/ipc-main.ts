import { BrowserWindow, IpcMainInvokeEvent, ipcMain } from 'electron';
import { appLogger } from '../app-logger';
import type {
  InvokeChannel,
  InvokeRequest,
  InvokeResponse,
  ReceiveArgs,
  ReceiveChannel,
  SendChannel,
  SendPayload,
} from './ipc-contract';
import {
  invokeChannelHasRequest,
  isParseFailure,
  parseInvokeRequest,
  parseSendPayload,
  sendChannelHasPayload,
} from './ipc-validate';
export { ipcErr, ipcOk, isIpcOk, type IpcErr, type IpcOk, type IpcResult } from './ipc-result';
import { ipcErr } from './ipc-result';

type InvokeHandler<C extends InvokeChannel> = InvokeRequest<C> extends void
  ? (event: IpcMainInvokeEvent) => InvokeResponse<C> | Promise<InvokeResponse<C>>
  : (
      event: IpcMainInvokeEvent,
      request: InvokeRequest<C>,
    ) => InvokeResponse<C> | Promise<InvokeResponse<C>>;

type SendHandler<C extends SendChannel> = SendPayload<C> extends void
  ? (event: Electron.IpcMainEvent) => void
  : (event: Electron.IpcMainEvent, payload: SendPayload<C>) => void;

/**
 * Register a typed ipcMain.handle for an invoke channel.
 * Non-void requests are validated with Zod before the handler runs.
 */
export function handleInvoke<C extends InvokeChannel>(channel: C, handler: InvokeHandler<C>): void {
  ipcMain.handle(channel, async (event, rawRequest?: unknown) => {
    const parsed = parseInvokeRequest(channel, rawRequest);
    if (isParseFailure(parsed)) {
      appLogger.warn('Invalid IPC invoke request', { channel, message: parsed.message });
      return ipcErr('INVALID_IPC_REQUEST', parsed.message);
    }
    if (!invokeChannelHasRequest(channel)) {
      return (handler as (event: IpcMainInvokeEvent) => InvokeResponse<C> | Promise<InvokeResponse<C>>)(
        event,
      );
    }
    return (
      handler as (
        event: IpcMainInvokeEvent,
        request: InvokeRequest<C>,
      ) => InvokeResponse<C> | Promise<InvokeResponse<C>>
    )(event, parsed.data);
  });
}

/**
 * Register a typed ipcMain.on for a renderer → main send channel.
 * Invalid payloads are logged and dropped (fire-and-forget has no reply).
 */
export function onRendererSend<C extends SendChannel>(channel: C, handler: SendHandler<C>): void {
  ipcMain.on(channel, (event, rawPayload?: unknown) => {
    const parsed = parseSendPayload(channel, rawPayload);
    if (isParseFailure(parsed)) {
      appLogger.warn('Invalid IPC send payload', { channel, message: parsed.message });
      return;
    }
    if (!sendChannelHasPayload(channel)) {
      (handler as (event: Electron.IpcMainEvent) => void)(event);
      return;
    }
    (handler as (event: Electron.IpcMainEvent, payload: SendPayload<C>) => void)(event, parsed.data);
  });
}

/**
 * Push a typed event to the AngularJS renderer.
 */
export function sendToRenderer<C extends ReceiveChannel>(
  window: BrowserWindow,
  channel: C,
  ...args: ReceiveArgs<C>
): void {
  appLogger.debug('Send data to angular', { event: channel, data: args[0] });
  try {
    window.webContents.send(channel, ...args);
  } catch {
    appLogger.debug('Error could appear when trying to access window when stopping application');
  }
}
