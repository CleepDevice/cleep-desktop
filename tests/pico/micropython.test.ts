import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkSerialPortAccess,
  describeSerialAccessError,
  listFilesRecursive,
  RPI_USB_VID,
} from '../../src/pico/micropython';

describe('listFilesRecursive', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns sorted relative posix paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-mpy-files-'));
    dirs.push(root);
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'main.py'), 'print(1)\n');
    fs.writeFileSync(path.join(root, 'lib', 'helper.py'), 'x=1\n');

    expect(listFilesRecursive(root)).toEqual(['lib/helper.py', 'main.py']);
  });

  it('returns empty list for missing directory', () => {
    expect(listFilesRecursive(path.join(os.tmpdir(), 'no-such-cleep-mpy'))).toEqual([]);
  });
});

describe('RPI_USB_VID', () => {
  it('matches Raspberry Pi vendor id', () => {
    expect(RPI_USB_VID).toBe('2E8A');
  });
});

describe('describeSerialAccessError', () => {
  it('mentions dialout on Linux permission errors', () => {
    const previous = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const message = describeSerialAccessError('/dev/ttyACM0', {
        code: 'EACCES',
        message: 'Permission denied, cannot open /dev/ttyACM0',
      });
      expect(message).toContain('/dev/ttyACM0');
      expect(message).toContain('dialout');
      expect(message).toContain('usermod');
    } finally {
      Object.defineProperty(process, 'platform', { value: previous });
    }
  });

  it('keeps generic message for other errors', () => {
    expect(describeSerialAccessError('/dev/ttyACM0', new Error('No such file'))).toContain(
      'No such file',
    );
  });
});

describe('checkSerialPortAccess', () => {
  const files: string[] = [];

  afterEach(() => {
    for (const file of files.splice(0)) {
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        /* ignore */
      }
      fs.rmSync(file, { force: true });
    }
  });

  it('returns ok for a readable/writable path', async () => {
    const file = path.join(os.tmpdir(), `cleep-mpy-access-${process.pid}.txt`);
    files.push(file);
    fs.writeFileSync(file, 'ok\n', { mode: 0o600 });
    await expect(checkSerialPortAccess(file)).resolves.toEqual({ ok: true });
  });

  it('returns a permission error for an inaccessible path', async () => {
    const file = path.join(os.tmpdir(), `cleep-mpy-denied-${process.pid}.txt`);
    files.push(file);
    fs.writeFileSync(file, 'nope\n', { mode: 0o000 });
    const result = await checkSerialPortAccess(file);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Permission denied|Unable to open|EACCES|permission/i);
  });
});
