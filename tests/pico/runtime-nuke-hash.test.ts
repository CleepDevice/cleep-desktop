import { describe, expect, it } from 'vitest';
import { NUKE_UF2_SHA256, NUKE_UF2_URL, NUKE_RELEASE_TAG } from '../../src/pico/nuke';
import { RUNTIME_SHA256, selectRuntimeVariant } from '../../src/pico/runtime';

describe('pinned runtime / nuke digests', () => {
  it('pins MicroPython SHA-256 for every board variant', () => {
    expect(RUNTIME_SHA256.pico).toMatch(/^[0-9a-f]{64}$/);
    expect(RUNTIME_SHA256.pico_w).toMatch(/^[0-9a-f]{64}$/);
    expect(RUNTIME_SHA256.pico2).toMatch(/^[0-9a-f]{64}$/);
    expect(RUNTIME_SHA256.pico2_w).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(Object.values(RUNTIME_SHA256)).size).toBe(4);
  });

  it('pins flash-nuke to a fixed release (not latest)', () => {
    expect(NUKE_RELEASE_TAG).toBe('v2.3.1-0');
    expect(NUKE_UF2_URL).toContain(`/download/${NUKE_RELEASE_TAG}/`);
    expect(NUKE_UF2_URL).not.toContain('/latest/');
    expect(NUKE_UF2_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('selectRuntimeVariant keeps pico2 distinct from pico', () => {
    expect(selectRuntimeVariant(['pico2_w'])).toBe('pico2_w');
    expect(selectRuntimeVariant(['pico_w'])).toBe('pico_w');
  });
});
