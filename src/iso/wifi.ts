import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { appLogger } from '../app-logger';

function execFileAsync(
  file: string,
  args: readonly string[],
  options: { timeout?: number; windowsHide?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Rough channel → MHz map for 2.4 / 5 GHz (enough for display / firstrun metadata). */
const CHANNEL_MHZ: Record<number, number> = (() => {
  const map: Record<number, number> = {};
  let frequency = 2412;
  for (let i = 1; i < 15; i++) {
    map[i] = frequency;
    frequency += 5;
  }
  frequency = 5180;
  for (let j = 36; j <= 64; j += 2) {
    map[j] = frequency;
    frequency += 10;
  }
  frequency = 5500;
  for (let k = 100; k <= 144; k += 2) {
    map[k] = frequency;
    frequency += 10;
  }
  frequency = 5745;
  for (let l = 149; l <= 161; l += 2) {
    map[l] = frequency;
    frequency += 10;
  }
  map[165] = 5825;
  return map;
})();

function frequencyFromChannel(channel: number): number {
  return CHANNEL_MHZ[channel] || 0;
}

function qualityToDb(qualityPercent: number): number {
  if (!Number.isFinite(qualityPercent)) {
    return 0;
  }
  return Math.round(qualityPercent / 2 - 100);
}

export type WifiNetworkSecurity = 'WPA' | 'WPA2' | 'WPA3' | 'WEP' | 'UNSECURED' | 'UNKNOWN';

export interface WifiNetwork {
  ssid: string;
  mac: string;
  channel: number;
  frequency: number;
  signalLevel: number;
  quality: number;
  security: WifiNetworkSecurity;
}

export interface WifiScanResult {
  networks: WifiNetwork[];
  /** Associated SSID when a full scan returned nothing (manual form prefills). */
  currentSsid: string | null;
}

const DARWIN_AIRPORT =
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';

/**
 * Host WiFi helpers for the install dialog.
 * Scans via OS tools directly (nmcli / netsh / airport|system_profiler on macOS).
 */
export class Wifi {
  private networks: WifiNetwork[] = [];
  private currentSsid: string | null = null;

  /**
   * Scan nearby APs; if empty/failed, still try to read the currently associated SSID
   * (macOS 14.4+ may need system_profiler; Win11 may block scans without Location).
   */
  public async refreshNetworks(): Promise<WifiScanResult> {
    this.currentSsid = null;
    try {
      this.networks = await this.scanNearbyNetworks();
    } catch (error) {
      appLogger.error('Wifi scan failed', { error });
      this.networks = [];
    }

    if (this.networks.length === 0) {
      this.currentSsid = await this.detectCurrentSsid();
      if (this.currentSsid) {
        appLogger.info('Wifi scan empty; using current association for manual form', {
          ssid: this.currentSsid,
        });
      }
    }

    return { networks: this.networks, currentSsid: this.currentSsid };
  }

  /**
   * True when a WiFi radio/adapter exists on the host.
   * Do not use "scan succeeded" alone: on many desktops without WiFi, nmcli scan
   * returns an empty list without error, which previously blocked manual SSID entry.
   */
  public async hasWifi(): Promise<boolean> {
    try {
      const present = await this.detectWifiAdapter();
      appLogger.debug('Wifi adapter detection', { present, platform: process.platform });
      return present;
    } catch (error) {
      appLogger.debug('Wifi adapter detection failed', { error });
      return false;
    }
  }

  /** OS-level adapter check (independent of association / nearby APs). */
  public async detectWifiAdapter(): Promise<boolean> {
    if (process.platform === 'linux') {
      return this.detectLinuxWifiAdapter();
    }
    if (process.platform === 'win32') {
      return this.detectWindowsWifiAdapter();
    }
    if (process.platform === 'darwin') {
      return this.detectDarwinWifiAdapter();
    }
    return false;
  }

  public getNetworks(): WifiNetwork[] {
    return this.networks;
  }

  public getCurrentSsid(): string | null {
    return this.currentSsid;
  }

  private async scanNearbyNetworks(): Promise<WifiNetwork[]> {
    if (process.platform === 'linux') {
      return this.scanLinuxNetworks();
    }
    if (process.platform === 'win32') {
      return this.scanWindowsNetworks();
    }
    if (process.platform === 'darwin') {
      return this.scanDarwinNetworks();
    }
    return [];
  }

  /**
   * Prefer legacy airport when still functional; fall back to system_profiler SPAirPortDataType
   * (slower, works on Sonoma 14.4+ where airport only prints a deprecation warning).
   */
  private async scanDarwinNetworks(): Promise<WifiNetwork[]> {
    const fromAirport = await this.scanDarwinAirport();
    if (fromAirport.length > 0) {
      appLogger.debug('Darwin wifi scan via airport', { count: fromAirport.length });
      return fromAirport;
    }
    const fromProfiler = await this.scanDarwinSystemProfiler();
    appLogger.debug('Darwin wifi scan via system_profiler', { count: fromProfiler.length });
    return fromProfiler;
  }

  private async scanDarwinAirport(): Promise<WifiNetwork[]> {
    try {
      await fs.promises.access(DARWIN_AIRPORT);
    } catch {
      return [];
    }
    try {
      const { stdout, stderr } = await execFileAsync(DARWIN_AIRPORT, ['-s'], {
        timeout: 20000,
      });
      const combined = `${stdout}\n${stderr}`;
      if (/deprecated|will be removed/i.test(combined) && !this.hasAirportScanRows(stdout)) {
        appLogger.debug('airport present but deprecated / empty; falling back');
        return [];
      }
      return this.parseAirportScan(stdout);
    } catch (error) {
      appLogger.debug('airport scan failed; falling back to system_profiler', { error });
      return [];
    }
  }

  private hasAirportScanRows(stdout: string): boolean {
    return stdout
      .split('\n')
      .some((line) => /(?:[0-9a-f]{2}:){5}[0-9a-f]{2}/i.test(line) && !/^\s*SSID\b/i.test(line));
  }

  private parseAirportScan(stdout: string): WifiNetwork[] {
    const networks: WifiNetwork[] = [];
    const seen = new Set<string>();
    // SSID (may contain spaces) … BSSID RSSI CHANNEL …
    const rowRe =
      /^(.+?)\s+((?:[0-9a-f]{2}:){5}[0-9a-f]{2})\s+(-?\d+)\s+(\d+)(?:[^\s]*)\s+\S+\s+\S+\s+(.+)$/i;

    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.replace(/\r/g, '');
      if (!line.trim() || /^\s*SSID\b/i.test(line)) {
        continue;
      }
      const match = line.match(rowRe);
      if (!match) {
        continue;
      }
      const ssid = match[1].trim();
      if (!ssid || seen.has(ssid)) {
        continue;
      }
      const channel = parseInt(match[4], 10) || 0;
      const signalLevel = parseInt(match[3], 10) || 0;
      seen.add(ssid);
      networks.push({
        ssid,
        mac: match[2],
        channel,
        frequency: frequencyFromChannel(channel),
        signalLevel,
        quality: Math.min(Math.max(2 * (signalLevel + 100), 0), 100),
        security: this.getNetworkSecurity(match[5]),
      });
    }
    return networks;
  }

  private async scanDarwinSystemProfiler(): Promise<WifiNetwork[]> {
    try {
      const { stdout } = await execFileAsync(
        'system_profiler',
        ['-json', 'SPAirPortDataType'],
        { timeout: 60000 },
      );
      return this.parseSystemProfilerAirPort(stdout);
    } catch (error) {
      appLogger.debug('system_profiler SPAirPortDataType failed', { error });
      return [];
    }
  }

  private parseSystemProfilerAirPort(stdout: string): WifiNetwork[] {
    const networks: WifiNetwork[] = [];
    const seen = new Set<string>();

    try {
      const root = JSON.parse(stdout) as {
        SPAirPortDataType?: Array<{
          spairport_airport_interfaces?: Array<{
            spairport_airport_other_local_wireless_networks?: Array<Record<string, unknown>>;
            spairport_current_network_information?: Record<string, unknown> | Array<Record<string, unknown>>;
          }>;
        }>;
      };
      const interfaces = root.SPAirPortDataType?.[0]?.spairport_airport_interfaces || [];
      for (const iface of interfaces) {
        const others = iface.spairport_airport_other_local_wireless_networks || [];
        for (const item of others) {
          this.pushProfilerNetwork(item, networks, seen);
        }
        // Include the associated network if missing from "other" (common when list is redacted).
        const current = iface.spairport_current_network_information;
        const currentItems = Array.isArray(current) ? current : current ? [current] : [];
        for (const item of currentItems) {
          this.pushProfilerNetwork(item, networks, seen);
        }
      }
    } catch (error) {
      appLogger.debug('Failed to parse system_profiler WiFi JSON', { error });
    }
    return networks;
  }

  private pushProfilerNetwork(
    item: Record<string, unknown>,
    networks: WifiNetwork[],
    seen: Set<string>,
  ): void {
    const ssid = String(item._name || '').trim();
    if (!ssid || seen.has(ssid)) {
      return;
    }
    const channelRaw = String(item.spairport_network_channel || '');
    const channel = parseInt(channelRaw.split(/\s+/)[0] || '0', 10) || 0;
    const signalNoise = String(item.spairport_signal_noise || '');
    const signalLevel = parseInt(signalNoise, 10) || 0;
    const securityRaw = String(item.spairport_security_mode || '');
    seen.add(ssid);
    networks.push({
      ssid,
      mac: String(item.spairport_network_bssid || ''),
      channel,
      frequency: frequencyFromChannel(channel),
      signalLevel,
      quality: signalLevel
        ? Math.min(Math.max(2 * (signalLevel + 100), 0), 100)
        : 0,
      security: this.getNetworkSecurity(securityRaw),
    });
  }

  private async scanLinuxNetworks(): Promise<WifiNetwork[]> {
    const { stdout } = await execFileAsync(
      'nmcli',
      [
        '--terse',
        '--fields',
        'active,ssid,bssid,mode,chan,freq,signal,security,wpa-flags,rsn-flags',
        'device',
        'wifi',
        'list',
      ],
      { timeout: 15000 },
    );
    return this.parseNmcliWifiList(stdout);
  }

  /**
   * nmcli terse lines use ':' separators; BSSID colons are escaped as '\:'.
   */
  private parseNmcliWifiList(stdout: string): WifiNetwork[] {
    const bssidRe = /[A-F0-9]{2}(?::[A-F0-9]{2}){5}/i;
    const networks: WifiNetwork[] = [];
    const seen = new Set<string>();

    for (const rawLine of stdout.split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      // nmcli escapes BSSID as aa\:bb\:… — normalize before field split.
      const normalized = line.replace(/\\:/g, ':');
      const bssidMatch = normalized.match(bssidRe);
      if (!bssidMatch || bssidMatch.index === undefined) {
        continue;
      }
      const mac = bssidMatch[0];
      const before = normalized.slice(0, bssidMatch.index);
      const after = normalized.slice(bssidMatch.index + mac.length);
      // before ends with the field separator after ssid: "yes:MySSID:" or ":MySSID:"
      const beforeParts = before.replace(/:$/, '').split(':');
      const afterParts = after.replace(/^:/, '').split(':');
      const ssid = (beforeParts.slice(1).join(':') || '').trim();
      if (!ssid || seen.has(ssid)) {
        continue;
      }
      // after: mode, chan, freq, signal, security, wpa-flags, rsn-flags
      const channel = parseInt(afterParts[1] || '0', 10) || 0;
      const frequency = parseInt(afterParts[2] || '0', 10) || frequencyFromChannel(channel);
      const quality = parseInt(afterParts[3] || '0', 10) || 0;
      const securityRaw = afterParts[4] || '';

      seen.add(ssid);
      networks.push({
        ssid,
        mac,
        channel,
        frequency,
        signalLevel: qualityToDb(quality),
        quality,
        security: this.getNetworkSecurity(securityRaw === '(none)' ? 'none' : securityRaw),
      });
    }
    return networks;
  }

  private async scanWindowsNetworks(): Promise<WifiNetwork[]> {
    const stdout = await this.execNetsh(['wlan', 'show', 'networks', 'mode=Bssid']);
    if (/location permission|access is denied/i.test(stdout)) {
      appLogger.warn(
        'Windows blocked WiFi scan (enable Location access for desktop apps)',
      );
      return [];
    }
    return this.parseNetshNetworks(stdout);
  }

  /**
   * Run netsh under cmd with UTF-8 code page so non-ASCII SSIDs survive on Windows.
   */
  private async execNetsh(args: readonly string[], timeout = 15000): Promise<string> {
    const cmdline = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ');
    const { stdout } = await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', `chcp 65001 >nul && netsh ${cmdline}`],
      { windowsHide: true, timeout },
    );
    return stdout;
  }

  private parseNetshNetworks(stdout: string): WifiNetwork[] {
    const lines = stdout.replace(/\r/g, '').split('\n');
    const blocks: string[][] = [];
    let current: string[] = [];

    // Skip header until first SSID line.
    let started = false;
    for (const line of lines) {
      if (/^\s*SSID\s+\d+\s*:/i.test(line)) {
        if (started && current.length) {
          blocks.push(current);
        }
        current = [line];
        started = true;
        continue;
      }
      if (started) {
        if (line.trim() === '' && current.length) {
          blocks.push(current);
          current = [];
        } else if (line.trim() !== '') {
          current.push(line);
        }
      }
    }
    if (current.length) {
      blocks.push(current);
    }

    const networks: WifiNetwork[] = [];
    const seen = new Set<string>();
    for (const block of blocks) {
      const network = this.parseNetshBlock(block);
      if (!network || seen.has(network.ssid)) {
        continue;
      }
      seen.add(network.ssid);
      networks.push(network);
    }
    return networks;
  }

  private parseNetshBlock(lines: string[]): WifiNetwork | null {
    // EN + FR labels (netsh output follows the Windows UI language).
    const field = (...names: string[]): string => {
      const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const re = new RegExp(`^\\s*(?:${alt})(?:\\s+\\d+)?\\s*:\\s*(.*)\\s*$`, 'i');
      for (const line of lines) {
        const match = line.match(re);
        if (match) {
          return match[1].trim();
        }
      }
      return '';
    };

    // "SSID 1 : MyNetwork" — not the bare "SSID :" under a BSSID section.
    let ssid = '';
    for (const line of lines) {
      const match = line.match(/^\s*SSID\s+\d+\s*:\s*(.*)\s*$/i);
      if (match) {
        ssid = match[1].trim();
        break;
      }
    }
    if (!ssid) {
      return null;
    }

    const mac = field('BSSID');
    const auth = field('Authentication', 'Authentification', 'Auth');
    const signalRaw = field('Signal').replace('%', '');
    const quality = parseFloat(signalRaw) || 0;
    const channel = parseInt(field('Channel', 'Canal'), 10) || 0;

    return {
      ssid,
      mac,
      channel,
      frequency: frequencyFromChannel(channel),
      signalLevel: qualityToDb(quality),
      quality,
      security: this.getNetworkSecurity(auth),
    };
  }

  private async detectCurrentSsid(): Promise<string | null> {
    try {
      if (process.platform === 'darwin') {
        return await this.detectDarwinCurrentSsid();
      }
      if (process.platform === 'win32') {
        return await this.detectWindowsCurrentSsid();
      }
      if (process.platform === 'linux') {
        return await this.detectLinuxCurrentSsid();
      }
    } catch (error) {
      appLogger.debug('Current wifi SSID detection failed', { error });
    }
    return null;
  }

  private async detectLinuxWifiAdapter(): Promise<boolean> {
    const nets = await fs.promises.readdir('/sys/class/net');
    for (const name of nets) {
      const base = path.join('/sys/class/net', name);
      for (const marker of ['wireless', 'phy80211']) {
        try {
          await fs.promises.access(path.join(base, marker));
          return true;
        } catch {
          // try next marker / iface
        }
      }
    }
    return false;
  }

  private async detectWindowsWifiAdapter(): Promise<boolean> {
    try {
      const stdout = await this.execNetsh(['wlan', 'show', 'interfaces'], 5000);
      const lower = stdout.toLowerCase();
      if (
        lower.includes('no wireless interface') ||
        lower.includes('not running') ||
        lower.includes("pas d'interface") ||
        lower.includes('aucune interface')
      ) {
        return false;
      }
      // EN "Name :" / FR "Nom :"
      return /^\s*(?:name|nom)\s*:/im.test(stdout);
    } catch {
      return false;
    }
  }

  private async detectDarwinWifiAdapter(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'], {
        timeout: 5000,
      });
      return /hardware port:\s*(wi-?fi|airport)/i.test(stdout);
    } catch {
      return false;
    }
  }

  private async detectDarwinWifiDevice(): Promise<string | null> {
    const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports'], {
      timeout: 5000,
    });
    const match = stdout.match(
      /Hardware Port:\s*(?:Wi-Fi|WiFi|AirPort)\s*\r?\nDevice:\s*(\S+)/i,
    );
    return match?.[1] ?? null;
  }

  private async detectDarwinCurrentSsid(): Promise<string | null> {
    const device = await this.detectDarwinWifiDevice();
    if (!device) {
      return null;
    }
    const { stdout } = await execFileAsync('networksetup', ['-getairportnetwork', device], {
      timeout: 5000,
    });
    if (/not associated/i.test(stdout)) {
      return null;
    }
    const match = stdout.match(/Current Wi-Fi Network:\s*(.+)\s*$/im);
    const ssid = match?.[1]?.trim();
    return ssid || null;
  }

  private async detectWindowsCurrentSsid(): Promise<string | null> {
    const stdout = await this.execNetsh(['wlan', 'show', 'interfaces'], 5000);
    if (
      /location permission|access is denied|autorisation.*localisation|accès refusé/i.test(
        stdout,
      )
    ) {
      appLogger.warn(
        'Windows blocked WiFi details (enable Location access for desktop apps)',
      );
      return null;
    }
    // Prefer bare "SSID :" (not "BSSID :").
    const match = stdout.match(/^\s*SSID\s*:\s*(.+)\s*$/im);
    const ssid = match?.[1]?.trim();
    if (!ssid) {
      return null;
    }
    return ssid;
  }

  private async detectLinuxCurrentSsid(): Promise<string | null> {
    const { stdout } = await execFileAsync(
      'nmcli',
      ['-t', '-f', 'ACTIVE,SSID', 'dev', 'wifi'],
      { timeout: 5000 },
    );
    for (const line of stdout.split('\n')) {
      const [active, ...rest] = line.split(':');
      if (active === 'yes') {
        const ssid = rest.join(':').trim();
        if (ssid) {
          return ssid;
        }
      }
    }
    return null;
  }

  private getNetworkSecurity(security: string): WifiNetworkSecurity {
    if (!security) return 'UNKNOWN';
    const lowerCaseSecurity = security.toLowerCase();
    if (lowerCaseSecurity.indexOf('wpa3') !== -1) return 'WPA3';
    if (lowerCaseSecurity.indexOf('wpa2') !== -1) return 'WPA2';
    if (lowerCaseSecurity.indexOf('wpa') !== -1) return 'WPA';
    if (lowerCaseSecurity.indexOf('wep') !== -1) return 'WEP';
    if (
      lowerCaseSecurity.indexOf('open') !== -1 ||
      lowerCaseSecurity.indexOf('none') !== -1 ||
      lowerCaseSecurity === 'open system'
    ) {
      return 'UNSECURED';
    }
    return 'UNKNOWN';
  }
}
