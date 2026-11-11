import { describe, expect, it } from 'vitest';
import { describeSerialAccessError } from '../../src/pico/micropython';
import { selectRuntimeVariant } from '../../src/pico/runtime';
import { serialPermissionHelp } from '../../src/pico/permissions';

describe('describeSerialAccessError platforms', () => {
  it('mentions dialout on Linux', () => {
    const previous = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const message = describeSerialAccessError('/dev/ttyACM0', { code: 'EACCES' });
      expect(message).toContain('dialout');
      expect(message).toContain('usermod');
    } finally {
      Object.defineProperty(process, 'platform', { value: previous });
    }
  });

  it('mentions COM port on Windows', () => {
    const previous = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const message = describeSerialAccessError('COM3', { code: 'EACCES' });
      expect(message).toMatch(/COM port|application/i);
    } finally {
      Object.defineProperty(process, 'platform', { value: previous });
    }
  });
});

describe('serialPermissionHelp', () => {
  it('delegates to describeSerialAccessError when error provided', () => {
    const message = serialPermissionHelp('/dev/ttyACM0', { code: 'EACCES', message: 'denied' });
    expect(message).toContain('/dev/ttyACM0');
  });
});

describe('selectRuntimeVariant', () => {
  it('picks pico_w from targets', () => {
    expect(selectRuntimeVariant(['pico_w'])).toBe('pico_w');
  });

  it('picks pico from non-wireless targets', () => {
    expect(selectRuntimeVariant(['pico', 'pico_h'])).toBe('pico');
  });

  it('picks pico2 and pico2_w from targets', () => {
    expect(selectRuntimeVariant(['pico2'])).toBe('pico2');
    expect(selectRuntimeVariant(['pico2_h'])).toBe('pico2');
    expect(selectRuntimeVariant(['pico2_w'])).toBe('pico2_w');
  });

  it('prefers pico2_w when BOOTSEL board is RP2350 and targets are empty', () => {
    expect(selectRuntimeVariant([], 'RP2350')).toBe('pico2_w');
  });

  it('defaults to pico_w when ambiguous', () => {
    expect(selectRuntimeVariant([])).toBe('pico_w');
  });
});
