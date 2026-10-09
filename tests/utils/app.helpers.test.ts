import detectPort from 'detect-port';
import { describe, expect, it, vi } from 'vitest';
import { findMatches, getError, getWsPort, parseArgs } from '../../src/utils/app.helpers';
import { appSettings } from '../../src/app-settings';

describe('parseArgs', () => {
  it('returns default values when no args are provided', () => {
    expect(parseArgs([])).toEqual({
      coreDisabled: false,
      consoleLogLevel: 'info',
      fileLogLevel: 'info',
    });
  });

  it('parses --nocore', () => {
    expect(parseArgs(['--nocore']).coreDisabled).toBe(true);
  });

  it('parses valid log levels', () => {
    expect(parseArgs(['--logfile=debug', '--logconsole=warn'])).toEqual({
      coreDisabled: false,
      consoleLogLevel: 'warn',
      fileLogLevel: 'debug',
    });
  });

  it('falls back to info for invalid log levels', () => {
    expect(parseArgs(['--logfile=verbose', '--logconsole=trace'])).toEqual({
      coreDisabled: false,
      consoleLogLevel: 'info',
      fileLogLevel: 'info',
    });
  });

  it('ignores unrelated args', () => {
    expect(parseArgs(['--foo', 'bar', '--nocore'])).toEqual({
      coreDisabled: true,
      consoleLogLevel: 'info',
      fileLogLevel: 'info',
    });
  });
});

describe('getError', () => {
  it('returns Unknown error when error is falsy', () => {
    expect(getError(null as unknown as Error)).toBe('Unknown error');
    expect(getError(undefined as unknown as Error)).toBe('Unknown error');
  });

  it('returns the error message when present', () => {
    expect(getError(new Error('boom'))).toBe('boom');
  });

  it('returns fallback when message is empty', () => {
    expect(getError({ message: '' } as Error)).toBe('no error message');
  });
});

describe('findMatches', () => {
  it('collects all regex matches', () => {
    const pattern = /href="(file-\d+\.zip)"/gu;
    const html = 'href="file-1.zip" other href="file-2.zip"';
    const matches: string[][] = [];

    findMatches(pattern, html, matches);

    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe('file-1.zip');
    expect(matches[1][1]).toBe('file-2.zip');
  });

  it('returns empty array when nothing matches', () => {
    const matches: string[][] = [];
    findMatches(/nope/gu, 'hello', matches);
    expect(matches).toEqual([]);
  });
});

describe('getWsPort', () => {
  it('detects and persists a free port in packaged mode', async () => {
    vi.mocked(detectPort).mockResolvedValue(7777);
    const setSpy = vi.spyOn(appSettings, 'set');

    await expect(getWsPort()).resolves.toBe(7777);
    expect(setSpy).toHaveBeenCalledWith('remote.wsport', 7777);
  });

  it('returns configured port in dev mode', async () => {
    const { appContext } = await import('../../src/app-context');
    Object.defineProperty(appContext, 'isDev', { configurable: true, value: true });
    appSettings.set('remote.wsport', 5610);

    await expect(getWsPort()).resolves.toBe(5610);
    Object.defineProperty(appContext, 'isDev', { configurable: true, value: false });
  });
});
