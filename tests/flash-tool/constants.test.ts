import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('flash-tool constants', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
  });

  it('returns macos flash wrapper filename on darwin', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { getFlashWrapperFilename } = await import('../../src/flash-tool/constants');
    expect(getFlashWrapperFilename()).toBe('flash.macos.sh');
  });

  it('returns windows flash wrapper filename on win32', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const { getFlashWrapperFilename } = await import('../../src/flash-tool/constants');
    expect(getFlashWrapperFilename()).toBe('flash.windows.bat');
  });

  it('returns linux flash wrapper filename on linux', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    const { getFlashWrapperFilename } = await import('../../src/flash-tool/constants');
    expect(getFlashWrapperFilename()).toBe('flash.linux.sh');
  });

  it('resolves macos flash wrapper path from resources', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const wrapper = path.resolve(__dirname, '../../resources/flashtool/flash.macos.sh');
    expect(fs.existsSync(wrapper)).toBe(true);

    const { getFlashWrapperPath } = await import('../../src/flash-tool/constants');
    expect(getFlashWrapperPath()).toBe(wrapper);
  });

  it('ships macos flash wrapper with rpi-imager cli contract', () => {
    const wrapper = path.resolve(__dirname, '../../resources/flashtool/flash.macos.sh');
    const content = fs.readFileSync(wrapper, 'utf8');
    expect(content.startsWith('#!/bin/sh')).toBe(true);
    expect(content).toContain('"$IMAGER" --cli');
    expect(content).toContain('--first-run-script');
    expect(content).toContain('rpi-imager');
    expect(content).toContain('set -eu');
  });
});
