import { beforeEach, describe, expect, it, vi } from 'vitest';

const watchMock = vi.fn();
const closeMock = vi.fn(async () => undefined);

vi.mock('chokidar', () => ({
  default: {
    watch: (...args: unknown[]) => {
      watchMock(...args);
      return {
        on: vi.fn().mockReturnThis(),
        close: closeMock,
      };
    },
  },
}));

describe('setupDevReloader', () => {
  beforeEach(() => {
    vi.resetModules();
    watchMock.mockClear();
    closeMock.mockClear();
  });

  it('watches html and build js when unpackaged', async () => {
    const electron = await import('electron');
    vi.mocked(electron.app).isPackaged = false;

    const { setupDevReloader } = await import('../../src/utils/dev-reloader');
    setupDevReloader();

    expect(watchMock).toHaveBeenCalledTimes(3);
    const watchedPaths = watchMock.mock.calls.map((call) => String(call[0]));
    expect(watchedPaths.some((p) => p.endsWith('html') || p.includes('/html'))).toBe(true);
    expect(watchedPaths.some((p) => p.includes('preload.js'))).toBe(true);
    expect(watchedPaths.some((p) => p.includes('build') && p.includes('.js'))).toBe(true);
  });

  it('does nothing when packaged', async () => {
    const electron = await import('electron');
    vi.mocked(electron.app).isPackaged = true;

    const { setupDevReloader } = await import('../../src/utils/dev-reloader');
    setupDevReloader();

    expect(watchMock).not.toHaveBeenCalled();
  });
});
