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
export { ipcErr, ipcOk, isIpcOk, type IpcErr, type IpcOk, type IpcResult } from './ipc-result';

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
 */
export function handleInvoke<C extends InvokeChannel>(channel: C, handler: InvokeHandler<C>): void {
  ipcMain.handle(channel, handler as never);
}

/**
 * Register a typed ipcMain.on for a renderer → main send channel.
 */
export function onRendererSend<C extends SendChannel>(channel: C, handler: SendHandler<C>): void {
  ipcMain.on(channel, handler as never);
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
