import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMismatchNotes,
  buildMismatchWarnings,
  familyFromBoardId,
  flashUf2ToBootsel,
  parseInfoUf2,
  type PicoBootselDevice,
} from '../../src/pico/bootsel';

describe('parseInfoUf2 / familyFromBoardId', () => {
  it('detects RP2040 from RPI-RP2 board id', () => {
    const parsed = parseInfoUf2('UF2 Bootloader v3.0\nModel: Raspberry Pi RP2\nBoard-ID: RPI-RP2\n');
    expect(parsed.boardId).toBe('RPI-RP2');
    expect(parsed.family).toBe('rp2040');
    expect(familyFromBoardId('RPI-RP2')).toBe('rp2040');
  });

  it('detects RP2350 from board id', () => {
    expect(parseInfoUf2('Board-ID: RP2350\n').family).toBe('rp2350');
    expect(familyFromBoardId('RP2350BOOT')).toBe('rp2350');
  });
});

describe('buildMismatchNotes', () => {
  const rp2040: PicoBootselDevice = {
    mountPath: '/media/user/RPI-RP2',
    boardId: 'RPI-RP2',
    family: 'rp2040',
    label: 'RPI-RP2',
    device: '/dev/sdb',
    description: 'RPI RP2 Boot',
  };

  const rp2350: PicoBootselDevice = {
    ...rp2040,
    mountPath: '/media/user/RP2350',
    boardId: 'RP2350',
    family: 'rp2350',
    label: 'RP2350',
  };

  it('marks pico2 firmware on rp2040 as error and wifi as warning', () => {
    const notes = buildMismatchNotes(['pico2_w'], rp2040);
    expect(notes.some((n) => n.level === 'error' && /Pico 2 \(RP2350\)/.test(n.message))).toBe(true);
    expect(notes.some((n) => n.level === 'warning' && /Wi-Fi/.test(n.message))).toBe(true);
    expect(buildMismatchWarnings(['pico2_w'], rp2040).length).toBe(notes.length);
  });

  it('marks pico firmware on rp2350 as error', () => {
    const notes = buildMismatchNotes(['pico_w'], rp2350);
    expect(notes.some((n) => n.level === 'error' && /Pico \(RP2040\)/.test(n.message))).toBe(true);
  });

  it('returns empty when no targets', () => {
    expect(buildMismatchNotes([], rp2040)).toEqual([]);
    expect(buildMismatchNotes(undefined, rp2040)).toEqual([]);
  });
});

describe('flashUf2ToBootsel', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('copies uf2 onto the mount and reports progress', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-bootsel-'));
    dirs.push(root);
    const mount = path.join(root, 'RPI-RP2');
    fs.mkdirSync(mount);
    fs.writeFileSync(path.join(mount, 'INFO_UF2.TXT'), 'Board-ID: RPI-RP2\n');
    const uf2 = path.join(root, 'payload.uf2');
    fs.writeFileSync(uf2, Buffer.alloc(64 * 1024, 1));

    const percents: number[] = [];
    await flashUf2ToBootsel(mount, uf2, (progress) => {
      percents.push(progress.percent);
    });

    expect(fs.existsSync(path.join(mount, 'payload.uf2'))).toBe(true);
    expect(fs.statSync(path.join(mount, 'payload.uf2')).size).toBe(64 * 1024);
    expect(percents.at(-1)).toBe(100);
  });
});
