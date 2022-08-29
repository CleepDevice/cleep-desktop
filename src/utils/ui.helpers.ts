import { BrowserWindow } from 'electron';
import { appLogger } from '../app-logger';

export function sendDataToAngularJs(window: BrowserWindow, event: string, data: unknown): void {
  try {
    window.webContents.send(event, data);
  } catch {
    appLogger.debug('Error could appear when trying to access window when stopping application');
  }
}
