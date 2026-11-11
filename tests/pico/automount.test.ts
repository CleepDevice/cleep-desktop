import { describe, expect, it } from 'vitest';
import {
  describeUnmountedBootsel,
  listUnmountedBootselLabels,
  type BootselAutomountResult,
} from '../../src/pico/bootsel';

describe('listUnmountedBootselLabels', () => {
  it('returns empty outside Linux', () => {
    const automount: BootselAutomountResult = {
      platform: 'darwin',
      attempted: false,
      detectedLabels: ['RPI-RP2'],
      attempts: [],
    };
    expect(listUnmountedBootselLabels(automount, new Set())).toEqual([]);
  });

  it('flags detected labels that failed to mount and are not listed', () => {
    const automount: BootselAutomountResult = {
      platform: 'linux',
      attempted: true,
      detectedLabels: ['RPI-RP2', 'RP2350'],
      attempts: [
        {
          label: 'RPI-RP2',
          byLabelPath: '/dev/disk/by-label/RPI-RP2',
          ok: false,
          errorMessage: 'Not authorized',
        },
        {
          label: 'RP2350',
          byLabelPath: '/dev/disk/by-label/RP2350',
          ok: true,
          alreadyMounted: true,
        },
      ],
    };
    expect(listUnmountedBootselLabels(automount, new Set(['RP2350']))).toEqual(['RPI-RP2']);
  });

  it('describeUnmountedBootsel mentions udisksctl', () => {
    expect(describeUnmountedBootsel(['RPI-RP2'])).toMatch(/udisksctl mount/);
  });
});
