import { networkInterfaces } from 'os';
import {
  broadcastForInterface,
  getDefaultInterfaceNames,
  isLinkLocalIPv4,
  isLoopbackIPv4,
  isPrivateIPv4Use,
} from '../pyre/iface';

/**
 * Canonical MAC form used everywhere in cleep-desktop (uppercase, colon-separated).
 */
export function normalizeMac(mac: string): string {
  return String(mac).trim().toUpperCase();
}

export function normalizeMacList(macs: unknown): string[] {
  if (!Array.isArray(macs)) {
    return [];
  }
  const normalized = new Set<string>();
  for (const mac of macs) {
    if (typeof mac !== 'string' || !mac.trim()) {
      continue;
    }
    const value = normalizeMac(mac);
    if (value === '00:00:00:00:00:00') {
      continue;
    }
    normalized.add(value);
  }
  return [...normalized];
}

/** True when two MAC lists share at least one address (same physical device). */
export function macListsOverlap(left: unknown, right: unknown): boolean {
  const a = new Set(normalizeMacList(left));
  if (a.size === 0) {
    return false;
  }
  for (const mac of normalizeMacList(right)) {
    if (a.has(mac)) {
      return true;
    }
  }
  return false;
}

/**
 * Collect MAC addresses on the same interface(s) pyre-ts would use for ZRE (default route, private IPv4).
 */
export function getMacAddresses(): string[] {
  const defaultNames = getDefaultInterfaceNames();
  const restrictToDefault = defaultNames.length > 0;
  const orderedNames = restrictToDefault ? defaultNames : Object.keys(networkInterfaces()).sort();

  const macs = new Set<string>();
  const nets = networkInterfaces();

  for (const name of orderedNames) {
    const addrs = nets[name];
    if (!addrs) {
      continue;
    }
    for (const addr of addrs) {
      const family = String(addr.family);
      if (family !== 'IPv4' && family !== '4') {
        continue;
      }
      if (addr.internal) {
        continue;
      }
      if (!addr.address || isLoopbackIPv4(addr.address) || isLinkLocalIPv4(addr.address)) {
        continue;
      }
      if (!isPrivateIPv4Use(addr.address)) {
        continue;
      }
      if (!broadcastForInterface(addr.address, addr.cidr, addr.netmask)) {
        continue;
      }
      if (!addr.mac || addr.mac === '00:00:00:00:00:00') {
        continue;
      }
      macs.add(normalizeMac(addr.mac));
    }
  }

  return [...macs];
}
