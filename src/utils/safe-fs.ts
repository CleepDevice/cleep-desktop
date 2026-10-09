/**
 * Filesystem helpers that enforce directory containment before every access.
 *
 * Codacy/ESLint `detect-non-literal-fs-filename` flags ANY non-literal fs path,
 * including after a startsWith guard (the rule is syntactic, not taint-aware).
 * Path safety is enforced here via assertPathInside; suppress the noisy rule
 * on these validated call sites only.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- paths validated by assertPathInside */
/* nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename */

import fs from 'fs';
import { assertPathInside } from './safe-path';

export function existsInside(rootDir: string, candidate: string): boolean {
  return fs.existsSync(assertPathInside(rootDir, candidate));
}

export function mkdirInside(rootDir: string, candidate: string, options?: fs.MakeDirectoryOptions): void {
  fs.mkdirSync(assertPathInside(rootDir, candidate), options);
}

export function chmodInside(rootDir: string, candidate: string, mode: number): void {
  fs.chmodSync(assertPathInside(rootDir, candidate), mode);
}

export function statInside(rootDir: string, candidate: string): fs.Stats {
  return fs.statSync(assertPathInside(rootDir, candidate));
}

export function unlinkInside(rootDir: string, candidate: string): void {
  fs.unlinkSync(assertPathInside(rootDir, candidate));
}

export function createReadStreamInside(
  rootDir: string,
  candidate: string,
  options: { encoding: BufferEncoding; start: number },
): fs.ReadStream {
  return fs.createReadStream(assertPathInside(rootDir, candidate), options);
}
