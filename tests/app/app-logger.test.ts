import logger from 'electron-log/node';
import { describe, expect, it, vi } from 'vitest';
import { appLogger } from '../../src/app-logger';
import { ipcOnHandlers } from '../setup';

describe('AppLogger', () => {
  it('routes log levels to electron-log', () => {
    appLogger.debug('d', { a: 1 });
    appLogger.info('i');
    appLogger.warn('w', 'extra');
    appLogger.error('e');

    expect(logger.debug).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('setLogLevel applies packaged levels', () => {
    appLogger.setLogLevel({
      coreDisabled: false,
      consoleLogLevel: 'warn',
      fileLogLevel: 'error',
    });
    expect(logger.transports.console.level).toBe('warn');
    expect(logger.transports.file.level).toBe('warn');

    appLogger.setLogLevel({
      coreDisabled: false,
      consoleLogLevel: 'no',
      fileLogLevel: 'no',
    });
    expect(logger.transports.console.level).toBe(false);
    expect(logger.transports.file.level).toBe(false);
  });

  it('handles renderer log ipc events', () => {
    const handler = ipcOnHandlers.get('logger-log');
    expect(handler).toBeTypeOf('function');
    handler({}, { level: 'info', message: 'from renderer', extra: { ok: true } });
    expect(logger.info).toHaveBeenCalledWith('[renderer] from renderer', { ok: true });
  });

  it('handles open-electron-logs and get-electron-log-path ipc', async () => {
    const { shell } = await import('electron');
    const { ipcHandleHandlers } = await import('../setup');

    ipcOnHandlers.get('open-electron-logs')({});
    expect(shell.openPath).toHaveBeenCalled();

    const logPath = await ipcHandleHandlers.get('get-electron-log-path')({});
    expect(logPath).toMatchObject({ ok: true, data: expect.stringContaining('cleepdesktop.log') });
  });

  it('falls back to info for unknown log level', () => {
    appLogger.log('no' as never, 'main', 'fallback');
    expect(logger.info).toHaveBeenCalledWith('[main] fallback');
  });
});
