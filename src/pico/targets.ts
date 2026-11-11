import type { PicoBootselDevice } from './bootsel';
import {
  describeUnmountedBootsel,
  listBootselDevices,
  listUnmountedBootselLabels,
  tryAutomountBootselVolumes,
} from './bootsel';
import type { MicroPythonPort } from './micropython';
import { listMicroPythonPorts } from './micropython';
import { reportPlatformIssue } from '../utils/sentry-report';

export type PicoTargetKind = 'serial' | 'bootsel';

/** Unified Pico target for the flash UI picker. */
export interface PicoFlashTarget {
  id: string;
  kind: PicoTargetKind;
  /** User-facing title without technical jargon. */
  title: string;
  subtitle: string;
  accessible: boolean;
  accessError?: string;
  mountPath?: string;
  serialPath?: string;
  boardId?: string;
  family?: string;
  label?: string;
}

function bootselTitle(_device: PicoBootselDevice): string {
  return 'Pico (storage mode)';
}

function serialTitle(port: MicroPythonPort): string {
  const name = port.friendlyName || 'Pico';
  if (/micropython/i.test(name)) {
    return 'Pico ready';
  }
  return 'Pico ready';
}

/**
 * List Pico boards available for flashing (BOOTSEL volumes + serial ports).
 * Attempts Linux automount of unmounted RPI-RP2 volumes first.
 */
export async function listPicoFlashTargets(): Promise<PicoFlashTarget[]> {
  const automount = await tryAutomountBootselVolumes();
  const [bootsel, serial] = await Promise.all([
    listBootselDevices({ automount: false }),
    listMicroPythonPorts(),
  ]);
  const targets: PicoFlashTarget[] = [];

  for (const device of bootsel) {
    targets.push({
      id: `bootsel:${device.mountPath}`,
      kind: 'bootsel',
      title: bootselTitle(device),
      subtitle: `${device.label || device.boardId || 'RPI-RP2'} — ${device.mountPath}`,
      accessible: true,
      mountPath: device.mountPath,
      boardId: device.boardId,
      family: device.family,
      label: device.label,
    });
  }

  const mountedLabels = new Set(
    bootsel.map((device) => String(device.label || device.boardId || '').toUpperCase()),
  );
  const unmounted = listUnmountedBootselLabels(automount, mountedLabels);
  for (const label of unmounted) {
    const message = describeUnmountedBootsel([label]);
    reportPlatformIssue('pico-automount', new Error(message), {
      label,
      attempts: automount.attempts,
      detectedLabels: automount.detectedLabels,
    });
    targets.push({
      id: `bootsel-unmounted:${label}`,
      kind: 'bootsel',
      title: 'Pico (storage mode — not mounted)',
      subtitle: message,
      accessible: false,
      accessError: message,
      label,
    });
  }

  for (const failed of automount.attempts.filter((item) => !item.ok)) {
    if (unmounted.includes(failed.label)) {
      continue;
    }
    reportPlatformIssue(
      'pico-automount',
      new Error(failed.errorMessage || 'udisksctl mount failed'),
      { label: failed.label, byLabelPath: failed.byLabelPath },
    );
  }

  for (const port of serial) {
    targets.push({
      id: `serial:${port.path}`,
      kind: 'serial',
      title: serialTitle(port),
      subtitle: port.accessible
        ? port.path
        : `${port.path} — no access`,
      accessible: port.accessible !== false,
      accessError: port.accessError,
      serialPath: port.path,
      label: port.friendlyName,
    });
  }

  return targets;
}
