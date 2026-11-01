import { app } from 'electron';
import { appLogger } from './app-logger';

/**
 * Electron picks the Linux password-store from the desktop environment.
 * MATE (and some others) are not in Chromium's libsecret list → ``basic_text``.
 * Force gnome-libsecret before ``ready`` so safeStorage can use the real keyring.
 * Must run before ``app.whenReady()`` / ``ready``.
 */
export function preferLinuxLibsecretPasswordStore(): void {
  if (process.platform !== 'linux') {
    return;
  }
  if (app.commandLine.hasSwitch('password-store')) {
    return;
  }

  const desktop = `${process.env.XDG_CURRENT_DESKTOP || ''} ${process.env.DESKTOP_SESSION || ''}`.toLowerCase();
  if (desktop.includes('kde') || desktop.includes('plasma')) {
    return;
  }

  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
  appLogger.info('Linux password-store forced to gnome-libsecret', { desktop: desktop.trim() || '(unset)' });
}
