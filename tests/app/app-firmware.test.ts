import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFirmware, appFirmware, firmwareHashHelpers } from '../../src/app-firmware';
import * as nuke from '../../src/pico/nuke';
import { ipcHandleHandlers, USER_DATA_DIR } from '../setup';

const firmwaresDir = path.join(USER_DATA_DIR, 'firmwares');

function cleanFirmwaresDir(): void {
  if (!fs.existsSync(firmwaresDir)) {
    fs.mkdirSync(firmwaresDir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(firmwaresDir)) {
    fs.rmSync(path.join(firmwaresDir, entry), { force: true, recursive: true });
  }
}

function writeCachedFirmware(hashHex: string, overrides: Record<string, unknown> = {}): string {
  const dir = path.join(firmwaresDir, hashHex);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'firmware.zip'), 'zip-bytes');
  fs.writeFileSync(path.join(dir, 'firmware.manifest'), '{}');
  const meta = {
    id: 'demo_pico_w_v1.0.0',
    hash: `sha256:${hashHex}`,
    name: 'Demo Pico',
    app: 'demo',
    firmware_version: '1.0.0',
    kind: 'native',
    date: '2026-11-09',
    targets: ['pico_w'],
    urls: { zip: '/firmware/demo/x.zip', manifest: '/firmware/demo/x.manifest' },
    deviceUuid: 'device-1',
    module: 'demo',
    cachedAt: Date.now(),
    zipPath: path.join(dir, 'firmware.zip'),
    manifestPath: path.join(dir, 'firmware.manifest'),
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
  return `sha256:${hashHex}`;
}

/** Cache entry whose zip bytes match ``meta.hash`` (needed by flashSmart integrity check). */
function writeIntegrityCachedFirmware(kind: string, content: string): string {
  const zipBytes = Buffer.from(content);
  const digest = crypto.createHash('sha256').update(zipBytes).digest('hex');
  const dir = path.join(firmwaresDir, digest);
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, 'firmware.zip');
  fs.writeFileSync(zipPath, zipBytes);
  const hash = `sha256:${digest}`;
  const manifestPath = path.join(dir, 'firmware.manifest');
  fs.writeFileSync(manifestPath, JSON.stringify({ hash }));
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({
      id: 'demo_flash',
      hash,
      name: 'Demo Flash',
      app: 'demo',
      firmware_version: '1.0.0',
      kind,
      date: '2026-11-11',
      targets: ['pico_w'],
      urls: { zip: '/z.zip', manifest: '/z.manifest' },
      deviceUuid: 'device-1',
      module: 'demo',
      cachedAt: Date.now(),
      zipPath,
      manifestPath,
    }),
  );
  return hash;
}

describe('firmwareHashHelpers', () => {
  it('normalizes bare hex and sha256-prefixed hashes', () => {
    const hex = 'a'.repeat(64);
    expect(firmwareHashHelpers.normalizeHash(hex)).toBe(`sha256:${hex}`);
    expect(firmwareHashHelpers.normalizeHash(`sha256:${hex}`)).toBe(`sha256:${hex}`);
    expect(firmwareHashHelpers.hashToDirName(`sha256:${hex}`)).toBe(hex);
  });
});

describe('AppFirmware', () => {
  beforeEach(() => {
    cleanFirmwaresDir();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanFirmwaresDir();
  });

  it('creates firmwares directory on construction when missing', () => {
    const isolatedUserData = path.join(os.tmpdir(), `cleep-fw-ctor-${Date.now()}`);
    const isolatedDir = path.join(isolatedUserData, 'firmwares');
    fs.mkdirSync(isolatedUserData, { recursive: true });
    vi.spyOn(app, 'getPath').mockReturnValue(isolatedUserData);

    const previousHandlers = {
      list: ipcHandleHandlers.get('firmware-list'),
      delete: ipcHandleHandlers.get('firmware-delete'),
      unknown: ipcHandleHandlers.get('firmware-unknown'),
      setBlocking: ipcHandleHandlers.get('firmware-set-blocking'),
      download: ipcHandleHandlers.get('firmware-download'),
    };

    expect(fs.existsSync(isolatedDir)).toBe(false);
    new AppFirmware();
    expect(fs.existsSync(isolatedDir)).toBe(true);

    ipcHandleHandlers.set('firmware-list', previousHandlers.list);
    ipcHandleHandlers.set('firmware-delete', previousHandlers.delete);
    ipcHandleHandlers.set('firmware-unknown', previousHandlers.unknown);
    ipcHandleHandlers.set('firmware-set-blocking', previousHandlers.setBlocking);
    ipcHandleHandlers.set('firmware-download', previousHandlers.download);

    fs.rmSync(isolatedUserData, { recursive: true, force: true });
  });

  it('lists and deletes cached firmwares by hash', () => {
    cleanFirmwaresDir();
    const hex = 'b'.repeat(64);
    const hash = writeCachedFirmware(hex);

    expect(appFirmware.has(hash)).toBe(true);
    expect(appFirmware.unknownHashes([hash, 'sha256:' + 'c'.repeat(64)])).toEqual([
      'sha256:' + 'c'.repeat(64),
    ]);

    const listed = appFirmware.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].hash).toBe(hash);
    expect(listed[0].name).toBe('Demo Pico');

    expect(appFirmware.delete(hash)).toBe(true);
    expect(appFirmware.has(hash)).toBe(false);
    expect(appFirmware.list()).toHaveLength(0);
  });

  it('flashSmart rejects missing cache entries', async () => {
    await expect(
      appFirmware.flashSmart({ hash: `sha256:${'d'.repeat(64)}` }),
    ).rejects.toThrow(/not in the local cache/i);
  });

  it('flashSmart rejects corrupted cached zip checksum', async () => {
    const hash = writeIntegrityCachedFirmware('native', 'good-bytes');
    const firmware = appFirmware.getByHash(hash);
    expect(firmware).toBeTruthy();
    fs.writeFileSync(firmware!.zipPath, 'tampered-bytes');
    await expect(appFirmware.flashSmart({ hash })).rejects.toThrow(/checksum mismatch/i);
  });

  it('flashSmart refuses unknown firmware kinds', async () => {
    const hash = writeIntegrityCachedFirmware('unknown-kind', 'kind-bytes');
    await expect(appFirmware.flashSmart({ hash })).rejects.toThrow(/cannot be flashed/i);
  });

  it('erasePico refuses concurrent flash', async () => {
    const fw = new AppFirmware();
    (fw as unknown as { flashing: boolean }).flashing = true;
    await expect(fw.erasePico({})).rejects.toThrow(/already running/i);
  });

  it('erasePico writes nuke UF2 after waiting for BOOTSEL', async () => {
    vi.spyOn(nuke, 'ensureFlashNukeUf2').mockResolvedValue('/tmp/fake-nuke.uf2');
    const wait = vi
      .spyOn(
        appFirmware as unknown as {
          waitForBootselDevice: () => Promise<{ mountPath: string }>;
        },
        'waitForBootselDevice',
      )
      .mockResolvedValue({ mountPath: '/media/test/RPI-RP2' });
    const write = vi
      .spyOn(
        appFirmware as unknown as {
          flashRawUf2File: (uf2: string, mount: string, label: string) => Promise<void>;
        },
        'flashRawUf2File',
      )
      .mockResolvedValue(undefined);

    await appFirmware.erasePico({});

    expect(nuke.ensureFlashNukeUf2).toHaveBeenCalled();
    expect(wait).toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      '/tmp/fake-nuke.uf2',
      '/media/test/RPI-RP2',
      expect.any(String),
    );
  });
});
