import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { createCleepApi, type IpcPrimitives } from '../../src/ipc/ipc-api';
import {
  INVOKE_CHANNELS,
  RECEIVE_CHANNELS,
  SEND_CHANNELS,
} from '../../src/ipc/ipc-channels';
import {
  INVOKE_REQUEST_SCHEMAS,
  SEND_PAYLOAD_SCHEMAS,
} from '../../src/ipc/ipc-validate';

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const HTML_JS_DIR = path.join(ROOT, 'html/js');

function listFiles(dir: string, ext: string, ignoreDirNames: string[] = []): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (ignoreDirNames.includes(entry)) {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full, ext, ignoreDirNames));
    } else if (entry.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function collectMatches(files: string[], pattern: RegExp): Set<string> {
  const found = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return found;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function diff(expected: readonly string[], actual: Set<string>): {
  missing: string[];
  extra: string[];
} {
  const expectedSet = new Set(expected);
  return {
    missing: sorted(expected.filter((channel) => !actual.has(channel))),
    extra: sorted([...actual].filter((channel) => !expectedSet.has(channel))),
  };
}

/** Touch every leaf method so the recording ipc mock captures channel names. */
function collectApiChannels(): {
  invoke: Set<string>;
  send: Set<string>;
  on: Set<string>;
} {
  const invoke = new Set<string>();
  const send = new Set<string>();
  const on = new Set<string>();

  const ipc: IpcPrimitives = {
    invoke: async (channel) => {
      invoke.add(channel);
      return { ok: true, data: null } as never;
    },
    send: (channel) => {
      send.add(channel);
    },
    on: (channel) => {
      on.add(channel);
      return () => undefined;
    },
  };

  const api = createCleepApi(ipc);
  const dummyPayload = {
    url: 'https://example.com',
    title: 't',
    key: 'cleep.debug',
    value: true,
    deviceUuid: 'uuid',
    account: 'admin',
    password: 'x',
    isoUrl: 'https://example.com/a.zip',
    isoSha256: 'a'.repeat(64),
    isoFilename: 'a.zip',
    drivePath: '/dev/sda',
    wifiData: null,
    level: 'info',
    message: 'hello',
    network: 'home',
    security: 'wpa',
    hidden: false,
  };

  const argSets: unknown[][] = [
    [],
    [undefined],
    [true],
    ['x'],
    [() => undefined],
    [dummyPayload],
    [['cleep.debug']],
  ];

  const touch = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (typeof value === 'function') {
        for (const args of argSets) {
          try {
            value(...args);
          } catch {
            // ignore arity / runtime errors — channel is recorded before they throw
          }
        }
      } else {
        touch(value);
      }
    }
  };

  touch(api);
  return { invoke, send, on };
}

describe('ipc contract drift', () => {
  it('keeps semantic api channels aligned with the contract allowlists', () => {
    const used = collectApiChannels();

    expect(diff(INVOKE_CHANNELS, used.invoke)).toEqual({ missing: [], extra: [] });
    expect(diff(SEND_CHANNELS, used.send)).toEqual({ missing: [], extra: [] });
    expect(diff(RECEIVE_CHANNELS, used.on)).toEqual({ missing: [], extra: [] });
  });

  it('keeps main-process handlers aligned with invoke/send contracts', () => {
    const srcFiles = listFiles(SRC_DIR, '.ts').filter(
      (file) => !file.endsWith('.d.ts') && !file.includes(`${path.sep}ipc${path.sep}`),
    );

    const handles = collectMatches(srcFiles, /\bhandleInvoke\(\s*['"]([^'"]+)['"]/g);
    const sends = collectMatches(srcFiles, /\bonRendererSend\(\s*['"]([^'"]+)['"]/g);
    const pushes = collectMatches(
      srcFiles,
      /\bsendToRenderer\(\s*[^,]+,\s*['"]([^'"]+)['"]/g,
    );

    expect(diff(INVOKE_CHANNELS, handles)).toEqual({ missing: [], extra: [] });
    expect(diff(SEND_CHANNELS, sends)).toEqual({ missing: [], extra: [] });
    expect(diff(RECEIVE_CHANNELS, pushes)).toEqual({ missing: [], extra: [] });
  });

  it('keeps Zod schema maps exhaustive for invoke/send contracts', () => {
    expect(sorted(Object.keys(INVOKE_REQUEST_SCHEMAS))).toEqual(sorted(INVOKE_CHANNELS));
    expect(sorted(Object.keys(SEND_PAYLOAD_SCHEMAS))).toEqual(sorted(SEND_CHANNELS));
  });

  it('forbids channel-string IPC helpers in Angular app code', () => {
    // Angular must use electron.<domain>.<method>, not raw channel names.
    // (Avoid matching Angular $broadcast('open-page') which shares a receive channel name.)
    const appFiles = listFiles(HTML_JS_DIR, '.js', ['libs']);
    const legacyHelper =
      /\belectron\.(send|sendReturn|on|onCoalesced)\s*\(/g;
    const lowLevelBridge = /\bcleep\.ipc\.(invoke|send|on)\s*\(/g;

    const leaked = new Map<string, string[]>();
    for (const file of appFiles) {
      // electron.service.js is the only place allowed to talk to window.cleep.api
      if (file.endsWith(`${path.sep}electron.service.js`)) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      const hits = [
        ...[...text.matchAll(legacyHelper)].map((match) => `electron.${match[1]}`),
        ...[...text.matchAll(lowLevelBridge)].map((match) => `cleep.ipc.${match[1]}`),
      ];
      if (hits.length) {
        leaked.set(path.relative(ROOT, file), sorted(new Set(hits)));
      }
    }

    expect(Object.fromEntries(leaked)).toEqual({});
  });
});
