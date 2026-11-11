import fs from 'fs';
import path from 'path';
import { SerialPort } from 'serialport';
import { appLogger } from '../app-logger';

/** Raspberry Pi USB vendor id (Pico / Pico 2 family). */
export const RPI_USB_VID = '2E8A';

export interface MicroPythonPort {
  path: string;
  manufacturer: string;
  serialNumber: string;
  productId: string;
  vendorId: string;
  friendlyName: string;
  /** False when the process cannot open the port (e.g. missing dialout on Linux). */
  accessible: boolean;
  /** Human-readable reason when ``accessible`` is false. */
  accessError?: string;
}

export type MicroPythonPushProgress = {
  percent: number;
  current?: string;
  terminated: boolean;
  error?: string;
};

function normalizeVidPid(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^0X/, '');
}

/**
 * Build a user-facing message when a serial port cannot be opened.
 */
export function describeSerialAccessError(serialPath: string, error: unknown): string {
  const err = error as NodeJS.ErrnoException | undefined;
  const code = err?.code || '';
  const raw = error instanceof Error ? error.message : String(error || '');
  const permissionDenied =
    code === 'EACCES' || /permission denied/i.test(raw) || /cannot open/i.test(raw);

  if (permissionDenied) {
    if (process.platform === 'linux') {
      return (
        `Permission denied opening ${serialPath}. ` +
        'On Linux, add your user to the "dialout" group, then log out and back in: ' +
        'sudo usermod -aG dialout $USER'
      );
    }
    if (process.platform === 'darwin') {
      return (
        `Permission denied opening ${serialPath}. ` +
        'Quit any other app using this serial port, unplug the Pico, then plug it back in.'
      );
    }
    return (
      `Permission denied opening ${serialPath}. ` +
      'Close any other application using this COM port, then unplug and replug the Pico.'
    );
  }

  return raw || `Unable to open ${serialPath}`;
}

/**
 * Check whether the current process can open ``serialPath`` for read/write.
 */
export async function checkSerialPortAccess(
  serialPath: string,
): Promise<{ ok: boolean; error?: string }> {
  const target = String(serialPath || '').trim();
  if (!target) {
    return { ok: false, error: 'Serial port path is empty' };
  }
  try {
    await fs.promises.access(target, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeSerialAccessError(target, error) };
  }
}

/**
 * List serial ports that look like a Raspberry Pi Pico CDC interface.
 */
export async function listMicroPythonPorts(): Promise<MicroPythonPort[]> {
  const ports = await SerialPort.list();
  const out: MicroPythonPort[] = [];
  for (const port of ports) {
    const vendorId = normalizeVidPid(port.vendorId);
    if (vendorId !== RPI_USB_VID) {
      continue;
    }
    const friendly =
      (port as { friendlyName?: string }).friendlyName ||
      port.manufacturer ||
      `Pico (${port.path})`;
    const access = await checkSerialPortAccess(port.path);
    out.push({
      path: port.path,
      manufacturer: port.manufacturer || '',
      serialNumber: port.serialNumber || '',
      productId: normalizeVidPid(port.productId),
      vendorId,
      friendlyName: friendly,
      accessible: access.ok,
      accessError: access.ok ? undefined : access.error,
    });
  }
  return out;
}

/**
 * Recursively list files under ``filesDir`` as relative posix paths.
 */
export function listFilesRecursive(filesDir: string): string[] {
  const root = path.resolve(filesDir);
  const results: string[] = [];

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        results.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return [];
  }
  walk(root);
  return results.sort();
}

class MicroPythonSession {
  private port: SerialPort;
  private buffer = Buffer.alloc(0);

  constructor(portPath: string) {
    this.port = new SerialPort({
      path: portPath,
      baudRate: 115200,
      autoOpen: false,
    });
  }

  async open(): Promise<void> {
    const access = await checkSerialPortAccess(this.port.path);
    if (!access.ok) {
      throw new Error(access.error || `Unable to open ${this.port.path}`);
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.port.open((error) => (error ? reject(error) : resolve()));
      });
    } catch (error) {
      throw new Error(describeSerialAccessError(this.port.path, error));
    }
    this.port.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    });
  }

  async close(): Promise<void> {
    try {
      await this.writeRaw(Buffer.from([0x02])); // Ctrl-B exit raw
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      if (!this.port.isOpen) {
        resolve();
        return;
      }
      this.port.close(() => resolve());
    });
  }

  private writeRaw(data: Buffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.write(data, (error) => {
        if (error) {
          reject(error);
          return;
        }
        this.port.drain((drainError) => (drainError ? reject(drainError) : resolve()));
      });
    });
  }

  private consumeUntil(predicate: (text: string) => boolean, timeoutMs: number): Promise<string> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const text = this.buffer.toString('utf8');
        if (predicate(text)) {
          this.buffer = Buffer.alloc(0);
          resolve(text);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`MicroPython serial timeout (got: ${JSON.stringify(text.slice(-80))})`));
          return;
        }
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  async enterRawRepl(): Promise<void> {
    // Interrupt any running program
    await this.writeRaw(Buffer.from([0x03, 0x03]));
    await delay(100);
    this.buffer = Buffer.alloc(0);
    await this.writeRaw(Buffer.from([0x01])); // Ctrl-A raw REPL
    await this.consumeUntil((text) => text.includes('raw REPL') || text.endsWith('>'), 3000);
  }

  async exec(code: string): Promise<string> {
    this.buffer = Buffer.alloc(0);
    await this.writeRaw(code);
    if (!code.endsWith('\n')) {
      await this.writeRaw('\n');
    }
    await this.writeRaw(Buffer.from([0x04])); // Ctrl-D execute
    const response = await this.consumeUntil((text) => {
      // OK<root>\x04<stderr>\x04>
      const parts = text.split('\x04');
      return text.startsWith('OK') && parts.length >= 3;
    }, 15000);

    if (!response.startsWith('OK')) {
      throw new Error(`MicroPython exec failed: ${response}`);
    }
    const parts = response.slice(2).split('\x04');
    const stderr = parts[1] || '';
    if (stderr.trim()) {
      throw new Error(stderr.trim());
    }
    return parts[0] || '';
  }

  async ensureDir(remoteDir: string): Promise<void> {
    const normalized = remoteDir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return;
    }
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      await this.exec(
        `try:\n import os\nexcept ImportError:\n import uos as os\n` +
          `try:\n os.mkdir(${JSON.stringify(current)})\nexcept OSError:\n pass\n`,
      );
    }
  }

  async writeFile(remotePath: string, data: Buffer): Promise<void> {
    const normalized = remotePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const dir = path.posix.dirname(normalized);
    if (dir && dir !== '.') {
      await this.ensureDir(dir);
    }

    await this.exec(
      `try:\n import binascii as _b\nexcept ImportError:\n import ubinascii as _b\n` +
        `_f=open(${JSON.stringify(normalized)},'wb')\n`,
    );

    const chunkSize = 180;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, offset + chunkSize);
      const b64 = chunk.toString('base64');
      await this.exec(`_f.write(_b.a2b_base64(${JSON.stringify(b64)}))\n`);
    }
    await this.exec(`_f.close()\n`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Probe whether a serial port speaks MicroPython raw REPL.
 */
export async function probeMicroPython(portPath: string): Promise<boolean> {
  const access = await checkSerialPortAccess(portPath);
  if (!access.ok) {
    return false;
  }
  const session = new MicroPythonSession(portPath);
  try {
    await session.open();
    await session.enterRawRepl();
    await session.exec('print(1)\n');
    return true;
  } catch (error) {
    appLogger.debug('MicroPython probe failed', { portPath, error });
    return false;
  } finally {
    try {
      await session.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wait until a Pico serial port answering MicroPython appears.
 */
export async function waitForMicroPythonPort(
  timeoutMs = 45000,
  pollMs = 1000,
): Promise<MicroPythonPort> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ports = await listMicroPythonPorts();
    for (const port of ports) {
      if (!port.accessible) {
        continue;
      }
      if (await probeMicroPython(port.path)) {
        return port;
      }
    }
    await delay(pollMs);
  }
  throw new Error(
    'Timed out waiting for the Pico to come back online after preparing the board.',
  );
}

/**
 * Push every file under ``filesDir`` to the Pico filesystem root (preserves relative paths).
 */
export async function pushFilesToMicroPython(
  portPath: string,
  filesDir: string,
  onProgress?: (progress: MicroPythonPushProgress) => void,
): Promise<void> {
  const files = listFilesRecursive(filesDir);
  if (!files.length) {
    throw new Error('No files to push (expected files/ in the firmware package)');
  }

  const session = new MicroPythonSession(portPath);
  await session.open();
  try {
    await session.enterRawRepl();
    for (let index = 0; index < files.length; index += 1) {
      const relative = files[index];
      const absolute = path.join(filesDir, relative);
      const data = fs.readFileSync(absolute);
      const percent = Math.round(((index + 1) / files.length) * 100);
      onProgress?.({
        percent: Math.min(99, percent),
        current: relative,
        terminated: false,
      });
      appLogger.info('Pushing MicroPython file', { relative, bytes: data.length });
      await session.writeFile(relative, data);
    }
    // Soft reset so main.py runs if present
    try {
      await session.exec(
        'try:\n import machine\n machine.soft_reset()\nexcept Exception:\n pass\n',
      );
    } catch {
      /* soft reset may drop the link — OK */
    }
    onProgress?.({ percent: 100, terminated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress?.({ percent: 100, terminated: true, error: message });
    throw error;
  } finally {
    await session.close();
  }
}
