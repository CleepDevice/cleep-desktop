import fs from 'fs';
import os from 'os';
import path from 'path';
import { vi } from 'vitest';

export const USER_DATA_DIR = path.join(os.tmpdir(), 'cleep-desktop-vitest');
fs.mkdirSync(USER_DATA_DIR, { recursive: true });

export const ipcHandleHandlers = new Map<string, (...args: unknown[]) => unknown>();
export const ipcOnHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => {
  const createWindowMock = () => ({
    webContents: {
      on: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'dom-ready') {
          cb();
        }
      }),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      openDevTools: vi.fn(),
      downloadURL: vi.fn(),
      session: {
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    once: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    maximize: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setProgressBar: vi.fn(),
  });

  const BrowserWindowMock = Object.assign(vi.fn(createWindowMock), {
    fromWebContents: vi.fn(() => createWindowMock()),
  });

  return {
    app: {
      isPackaged: true,
      name: 'CleepDesktop',
      getVersion: () => '0.0.0-test',
      getPath: (name: string) => {
        if (name === 'temp') {
          return os.tmpdir();
        }
        if (name === 'downloads') {
          return path.join(USER_DATA_DIR, 'downloads');
        }
        return USER_DATA_DIR;
      },
      quit: vi.fn(),
      badgeCount: 0,
      dock: {
        downloadFinished: vi.fn(),
      },
    },
    ipcMain: {
      on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcOnHandlers.set(channel, handler);
      }),
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandleHandlers.set(channel, handler);
      }),
    },
    shell: {
      openPath: vi.fn(),
      openExternal: vi.fn(),
      showItemInFolder: vi.fn(),
    },
    dialog: {
      showMessageBox: vi.fn(),
      showMessageBoxSync: vi.fn(() => 0),
    },
    Menu: {
      buildFromTemplate: vi.fn((template) => template),
      setApplicationMenu: vi.fn(),
    },
    BrowserWindow: BrowserWindowMock,
  };
});

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    allowPrerelease: false,
    currentVersion: { format: () => '0.0.0-test' },
    quitAndInstall: vi.fn(),
    checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.0.0-test' } })),
    on: vi.fn(),
    addListener: vi.fn(),
    downloadUpdate: vi.fn(),
  },
}));

vi.mock('drivelist', () => ({
  list: vi.fn(async () => []),
}));

vi.mock('electron-log/node', () => ({
  default: {
    transports: {
      console: { level: false, format: '' },
      file: {
        level: false,
        maxSize: 0,
        resolvePathFn: null,
        getFile: () => ({ path: path.join(USER_DATA_DIR, 'cleepdesktop.log') }),
      },
    },
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('electron-settings', () => {
  const store: Record<string, unknown> = {
    remote: { wsport: 5610 },
    cleep: { debug: false, uuid: 'test-uuid', crashreport: false },
    flashtool: { version: null },
    devices: {},
  };

  const getByPath = (keyPath?: string): unknown => {
    if (!keyPath) {
      return store;
    }
    return keyPath.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, store);
  };

  const setByPath = (keyPath: string, value: unknown): void => {
    const parts = keyPath.split('.');
    let current: Record<string, unknown> = store;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  };

  return {
    default: {
      configure: vi.fn(),
      getSync: vi.fn((keyPath?: string) => getByPath(keyPath)),
      setSync: vi.fn((keyPath: string | Record<string, unknown>, value?: unknown) => {
        if (typeof keyPath === 'object') {
          Object.assign(store, keyPath);
          return;
        }
        setByPath(keyPath, value);
      }),
      hasSync: vi.fn((keyPath: string) => getByPath(keyPath) !== undefined),
      file: vi.fn(() => path.join(USER_DATA_DIR, 'settings.json')),
    },
  };
});

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
}));

vi.mock('detect-port', () => ({
  default: vi.fn(async () => 5610),
}));

vi.mock('node-wifi', () => ({
  init: vi.fn(),
  scan: vi.fn((callback: (error: Error | null, networks: unknown[]) => void) => callback(null, [])),
  getCurrentConnections: vi.fn((callback: (error: Error | null, connections: unknown[]) => void) =>
    callback(null, []),
  ),
}));

vi.mock('find-process', () => ({
  default: vi.fn(async () => []),
}));

vi.mock('terminate', () => ({
  default: vi.fn((_pid: number, callback?: (error?: Error) => void) => callback?.()),
}));
