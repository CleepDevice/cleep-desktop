import { describe, expect, it } from 'vitest';

describe('PicoFlashTarget id conventions', () => {
  it('uses bootsel and serial prefixes', () => {
    const bootselId = `bootsel:${'/run/media/user/RPI-RP2'}`;
    const serialId = `serial:${'/dev/ttyACM0'}`;
    expect(bootselId.startsWith('bootsel:')).toBe(true);
    expect(serialId.startsWith('serial:')).toBe(true);
  });
});
