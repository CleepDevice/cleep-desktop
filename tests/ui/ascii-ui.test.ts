import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Typographic Unicode in UI sources (em dash, curly quotes, …) often shows as
 * mojibake (â€") when charset/encoding drifts. Keep html/ UI sources ASCII-safe.
 */
const FORBIDDEN = /[\u2010-\u2015\u2212\u2026\u2018\u2019\u201c\u201d\u00a0]/;

const ROOT = path.resolve(__dirname, '../../html');
const SKIP_DIR = new Set(['libs', 'fonts', 'images']);
const EXTS = new Set(['.js', '.html', '.css']);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('ascii UI sources', () => {
  it('rejects typographic punctuation in html/ (except libs/fonts/images)', () => {
    const offenders: string[] = [];
    for (const file of collectFiles(ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (FORBIDDEN.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
