import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces, platform } from "node:os";

export type IfaceInfo = {
  name: string;
  address: string;
  /** Destination for UDP beacon sends (broadcast or multicast group). */
  broadcast: string;
  /** When set, UDP socket binds to this address instead of 0.0.0.0 (Linux/CZMQ style). */
  bindAddress?: string;
  multicast: boolean;
};

const MULTICAST_GROUP = "225.25.25.25";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function intToIpv4(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/** RFC 1918 + RFC 6598 (aligned with netaddr is_ipv4_private_use). */
export function isPrivateIPv4Use(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  return false;
}

export function isLinkLocalIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 169 && b === 254;
}

export function isLoopbackIPv4(ip: string): boolean {
  const [a] = ip.split(".").map(Number);
  return a === 127;
}

function prefixFromNetmask(netmask: string): number | null {
  const mask = ipv4ToInt(netmask);
  if (mask === 0) {
    return 0;
  }
  let bits = 0;
  let value = mask;
  while (value & 0x80000000) {
    bits += 1;
    value = (value << 1) >>> 0;
  }
  if (value !== 0) {
    return null;
  }
  return bits;
}

function prefixFromCidr(cidr: string | null | undefined): number | null {
  if (!cidr?.includes("/")) {
    return null;
  }
  const prefix = Number(cidr.split("/")[1]);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }
  return prefix;
}

/** Broadcast address from IPv4 + prefix length (same as Python ipaddress IPv4Interface.network.broadcast_address). */
export function broadcastFromPrefix(address: string, prefix: number): string {
  const bits = Math.max(0, Math.min(32, prefix));
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const addr = ipv4ToInt(address);
  return intToIpv4((addr & mask) | (~mask >>> 0));
}

export function broadcastForInterface(address: string, cidr?: string | null, netmask?: string | null): string | null {
  const fromCidr = prefixFromCidr(cidr ?? null);
  if (fromCidr !== null) {
    return broadcastFromPrefix(address, fromCidr);
  }
  if (netmask) {
    const fromMask = prefixFromNetmask(netmask);
    if (fromMask !== null) {
      return broadcastFromPrefix(address, fromMask);
    }
  }
  return null;
}

function defaultInterfaceNamesLinux(): string[] {
  try {
    const data = readFileSync("/proc/net/route", "utf8");
    const names = new Set<string>();
    for (const line of data.trim().split("\n").slice(1)) {
      const [iface, dest] = line.split("\t");
      if (dest === "00000000") {
        names.add(iface);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

function defaultInterfaceNamesDarwin(): string[] {
  try {
    const out = execFileSync("/sbin/route", ["-n", "get", "default"], {
      encoding: "utf8",
      timeout: 3000,
    });
    const match = out.match(/^\s*interface:\s*(\S+)/m);
    return match?.[1] ? [match[1]] : [];
  } catch {
    return [];
  }
}

function defaultInterfaceNamesWindows(): string[] {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias",
      ],
      { encoding: "utf8", timeout: 8000 },
    );
    const name = out.trim().split(/\r?\n/).pop()?.trim();
    return name ? [name] : [];
  } catch {
    return [];
  }
}

/**
 * Interface names used by the default IPv4 route (pyre-gevent zbeacon __fill_gateways).
 */
export function getDefaultInterfaceNames(): string[] {
  const p = platform();
  if (p === "linux") {
    return defaultInterfaceNamesLinux();
  }
  if (p === "darwin") {
    return defaultInterfaceNamesDarwin();
  }
  if (p === "win32") {
    return defaultInterfaceNamesWindows();
  }
  return [];
}

type IPv4Candidate = IfaceInfo & { sortKey: number };

export type ListedNetworkInterface = {
  name: string;
  address: string | null;
  /** Can be used for ZRE beacons (private IPv4 with broadcast). */
  usableForBus: boolean;
  onDefaultRoute: boolean;
};

function collectCandidates(
  interfaceName: string | undefined,
  defaultNames: string[],
  options?: { allInterfaces?: boolean },
): IPv4Candidate[] {
  const nets = networkInterfaces();
  const restrictToDefault =
    !interfaceName && !options?.allInterfaces && defaultNames.length > 0;
  const candidates: IPv4Candidate[] = [];

  const orderedNames = interfaceName
    ? [interfaceName]
    : restrictToDefault
      ? defaultNames
      : Object.keys(nets).sort();

  for (let sortKey = 0; sortKey < orderedNames.length; sortKey += 1) {
    const name = orderedNames[sortKey];
    const addrs = nets[name];
    if (!addrs) {
      continue;
    }

    for (const addr of addrs) {
      const family = String(addr.family);
      if (family !== "IPv4" && family !== "4") {
        continue;
      }
      if (addr.internal) {
        continue;
      }

      const address = addr.address;
      if (!address || isLoopbackIPv4(address) || isLinkLocalIPv4(address)) {
        continue;
      }
      if (!isPrivateIPv4Use(address)) {
        continue;
      }

      const broadcast = broadcastForInterface(address, addr.cidr, addr.netmask);
      if (!broadcast) {
        continue;
      }

      candidates.push({
        name,
        address,
        broadcast,
        bindAddress: platform() === "linux" ? broadcast : undefined,
        multicast: false,
        sortKey,
      });
    }
  }

  return candidates;
}

function loopbackFallback(): IfaceInfo {
  return {
    name: "loopback",
    address: "127.0.0.1",
    broadcast: MULTICAST_GROUP,
    multicast: true,
  };
}

/**
 * Pick the LAN interface for ZRE beacons and advertised TCP endpoint.
 * Mirrors pyre-gevent zbeacon._prepare_socket when no interface is forced.
 */
/**
 * All local network interfaces (for manual bus binding in Preferences).
 */
export function listNetworkInterfaces(): ListedNetworkInterface[] {
  const defaultNames = getDefaultInterfaceNames();
  const defaultSet = new Set(defaultNames);
  const usableCandidates = collectCandidates(undefined, defaultNames, { allInterfaces: true });
  const bestUsableByName = new Map<string, IPv4Candidate>();
  for (const candidate of usableCandidates) {
    const existing = bestUsableByName.get(candidate.name);
    if (!existing || candidate.sortKey < existing.sortKey) {
      bestUsableByName.set(candidate.name, candidate);
    }
  }

  const nets = networkInterfaces();
  const listed: ListedNetworkInterface[] = [];

  for (const name of Object.keys(nets).sort()) {
    const usable = bestUsableByName.get(name);
    if (usable) {
      listed.push({
        name,
        address: usable.address,
        usableForBus: true,
        onDefaultRoute: defaultSet.has(name),
      });
      continue;
    }

    const addrs = nets[name] ?? [];
    let fallbackAddress: string | null = null;
    for (const addr of addrs) {
      const family = String(addr.family);
      if ((family === "IPv4" || family === "4") && !addr.internal && addr.address) {
        fallbackAddress = addr.address;
        break;
      }
    }

    listed.push({
      name,
      address: fallbackAddress,
      usableForBus: false,
      onDefaultRoute: defaultSet.has(name),
    });
  }

  return listed;
}

export function selectInterface(interfaceName?: string): IfaceInfo {
  const defaultNames = getDefaultInterfaceNames();
  const candidates = collectCandidates(interfaceName, defaultNames);

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.sortKey - b.sortKey);
    const chosen = candidates[0];
    return {
      name: chosen.name,
      address: chosen.address,
      broadcast: chosen.broadcast,
      bindAddress: chosen.bindAddress,
      multicast: chosen.multicast,
    };
  }

  if (interfaceName) {
    throw new Error(`No usable IPv4 address found on interface ${interfaceName}`);
  }

  return loopbackFallback();
}
