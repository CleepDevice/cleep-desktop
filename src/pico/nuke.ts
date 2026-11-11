import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { downloadFile, generateSha256 } from '../utils/download';
import { appLogger } from '../app-logger';

/** Pinned pico-sdk-prebuilts release that ships nuke_universal.uf2. */
export const NUKE_RELEASE_TAG = 'v2.3.1-0';

/** Universal flash-nuke UF2 (RP2040 / RP2350) — pinned release, not ``latest``. */
export const NUKE_UF2_URL =
  `https://github.com/raspberrypi/pico-sdk-prebuilts/releases/download/${NUKE_RELEASE_TAG}/nuke_universal.uf2`;

/** Official SHA-256 of nuke_universal.uf2 from {@link NUKE_RELEASE_TAG}. */
export const NUKE_UF2_SHA256 =
  'f3c3b6a62d2d7e944f336bc2ec73393f00adfbb56b6fa7440ba7ee3d5ad5b49d';

export const NUKE_UF2_FILENAME = 'nuke_universal.uf2';

function nukeRoot(): string {
  return path.join(app.getPath('userData'), 'firmwares', 'runtimes');
}

export function nukeUf2Path(): string {
  return path.join(nukeRoot(), NUKE_UF2_FILENAME);
}

async function assertSha256(filePath: string, expectedHex: string): Promise<void> {
  const digest = await generateSha256(filePath);
  if (digest !== expectedHex) {
    throw new Error(
      `Invalid flash-nuke checksum (expected ${expectedHex.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`,
    );
  }
}

/**
 * Ensure the official flash-nuke UF2 is cached locally.
 */
export async function ensureFlashNukeUf2(
  onProgress?: (percent: number, current: string) => void,
): Promise<string> {
  const dir = nukeRoot();
  fs.mkdirSync(dir, { recursive: true });
  const uf2Path = nukeUf2Path();

  if (fs.existsSync(uf2Path) && fs.statSync(uf2Path).size > 500) {
    try {
      await assertSha256(uf2Path, NUKE_UF2_SHA256);
      onProgress?.(100, 'Erase tool ready');
      return uf2Path;
    } catch (error) {
      appLogger.warn('Cached flash-nuke failed checksum, re-downloading', { error });
      try {
        fs.unlinkSync(uf2Path);
      } catch {
        /* ignore */
      }
    }
  }

  onProgress?.(5, 'Downloading erase tool…');
  appLogger.info('Downloading flash nuke UF2', { url: NUKE_UF2_URL });
  const tmpPath = await downloadFile(
    NUKE_UF2_URL,
    (progress) => {
      const percent = Math.min(95, 5 + Math.round((progress.percent || 0) * 0.9));
      onProgress?.(percent, 'Downloading erase tool…');
    },
    NUKE_UF2_SHA256,
  );

  fs.copyFileSync(tmpPath, uf2Path);
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }

  await assertSha256(uf2Path, NUKE_UF2_SHA256);
  appLogger.info('Flash nuke UF2 cached', { uf2Path, digest: NUKE_UF2_SHA256 });
  onProgress?.(100, 'Erase tool ready');
  return uf2Path;
}
