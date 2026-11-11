import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { downloadFile, generateSha256 } from '../utils/download';
import { appLogger } from '../app-logger';

/** Pinned MicroPython release used as default board runtime. */
export const MICROPYTHON_VERSION = '1.29.0';
export const MICROPYTHON_DATE = '20260824';

export type MicroPythonBoardVariant = 'pico' | 'pico_w' | 'pico2' | 'pico2_w';

const RUNTIME_URLS: Record<MicroPythonBoardVariant, string> = {
  pico: `https://micropython.org/resources/firmware/RPI_PICO-${MICROPYTHON_DATE}-v${MICROPYTHON_VERSION}.uf2`,
  pico_w: `https://micropython.org/resources/firmware/RPI_PICO_W-${MICROPYTHON_DATE}-v${MICROPYTHON_VERSION}.uf2`,
  pico2: `https://micropython.org/resources/firmware/RPI_PICO2-${MICROPYTHON_DATE}-v${MICROPYTHON_VERSION}.uf2`,
  pico2_w: `https://micropython.org/resources/firmware/RPI_PICO2_W-${MICROPYTHON_DATE}-v${MICROPYTHON_VERSION}.uf2`,
};

/** Official SHA-256 digests for the pinned MicroPython UF2 builds above. */
export const RUNTIME_SHA256: Record<MicroPythonBoardVariant, string> = {
  pico: 'e1160e602e277d85920adb5fe741435edccba9ba6ecadc85fdab75252eeff4e9',
  pico_w: 'f918c0a082c6daf53e27998b7f990ba5f065db2e298b21a34024532a20786794',
  pico2: '6bfc5d110f293870f60150468dfeec8aec5323b57415a0b9a86e6c334e876e93',
  pico2_w: 'c49c7ed93eb7eeaaa78436b17bd4329e5d4ccbaebc1e79503ad75e0a29c4530e',
};

export interface MicroPythonRuntimeInfo {
  variant: MicroPythonBoardVariant;
  version: string;
  uf2Path: string;
  url: string;
}

function runtimeRoot(): string {
  return path.join(app.getPath('userData'), 'firmwares', 'runtimes');
}

const VARIANT_UF2_NAME: Record<MicroPythonBoardVariant, string> = {
  pico: 'RPI_PICO',
  pico_w: 'RPI_PICO_W',
  pico2: 'RPI_PICO2',
  pico2_w: 'RPI_PICO2_W',
};

function uf2Filename(variant: MicroPythonBoardVariant): string {
  return `${VARIANT_UF2_NAME[variant]}-v${MICROPYTHON_VERSION}.uf2`;
}

export function runtimeUf2Path(variant: MicroPythonBoardVariant): string {
  return path.join(runtimeRoot(), uf2Filename(variant));
}

/**
 * Pick MicroPython board UF2 from firmware targets / BOOTSEL board hints.
 */
export function selectRuntimeVariant(
  targets?: string[],
  boardId?: string,
): MicroPythonBoardVariant {
  const wanted = (targets || []).map((t) => String(t).toLowerCase());
  const board = String(boardId || '').toUpperCase();
  const boardIsRp2350 = board.includes('RP2350');

  if (wanted.some((t) => t === 'pico2_w')) {
    return 'pico2_w';
  }
  if (wanted.some((t) => t === 'pico2' || t === 'pico2_h')) {
    return 'pico2';
  }
  if (wanted.some((t) => t === 'pico_w')) {
    return 'pico_w';
  }
  if (wanted.some((t) => t === 'pico' || t === 'pico_h')) {
    return 'pico';
  }
  if (boardIsRp2350) {
    // BOOTSEL cannot tell Pico 2 vs Pico 2 W — prefer W build when ambiguous.
    return 'pico2_w';
  }
  if (board.includes('W') && board.includes('PICO')) {
    return 'pico_w';
  }
  // Default to Pico W when ambiguous — works on W; non-W boards should declare targets.
  return 'pico_w';
}

async function assertSha256(filePath: string, expectedHex: string): Promise<void> {
  const digest = await generateSha256(filePath);
  if (digest !== expectedHex) {
    throw new Error(
      `Invalid MicroPython runtime checksum (expected ${expectedHex.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`,
    );
  }
}

/**
 * Ensure the MicroPython UF2 for ``variant`` is cached locally (download if needed).
 */
export async function ensureMicroPythonRuntime(
  variant: MicroPythonBoardVariant,
  onProgress?: (percent: number, current: string) => void,
): Promise<MicroPythonRuntimeInfo> {
  const dir = runtimeRoot();
  fs.mkdirSync(dir, { recursive: true });
  const uf2Path = runtimeUf2Path(variant);
  const url = RUNTIME_URLS[variant];
  const expectedSha = RUNTIME_SHA256[variant];

  if (fs.existsSync(uf2Path) && fs.statSync(uf2Path).size > 1000) {
    try {
      await assertSha256(uf2Path, expectedSha);
      onProgress?.(100, 'Board runtime ready');
      return { variant, version: MICROPYTHON_VERSION, uf2Path, url };
    } catch (error) {
      appLogger.warn('Cached MicroPython runtime failed checksum, re-downloading', {
        variant,
        error,
      });
      try {
        fs.unlinkSync(uf2Path);
      } catch {
        /* ignore */
      }
    }
  }

  onProgress?.(5, 'Preparing the board…');
  appLogger.info('Downloading MicroPython runtime', { variant, url });
  const tmpPath = await downloadFile(
    url,
    (progress) => {
      const percent = Math.min(95, 5 + Math.round((progress.percent || 0) * 0.9));
      onProgress?.(percent, 'Preparing the board…');
    },
    expectedSha,
  );

  fs.copyFileSync(tmpPath, uf2Path);
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }

  await assertSha256(uf2Path, expectedSha);
  appLogger.info('MicroPython runtime cached', { variant, uf2Path, digest: expectedSha });
  onProgress?.(100, 'Board runtime ready');
  return { variant, version: MICROPYTHON_VERSION, uf2Path, url };
}
