import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { appLogger } from '../app-logger';
import * as NodeWifi from 'node-wifi';

function execFileAsync(
  file: string,
  args: readonly string[],
  options: { timeout?: number; windowsHide?: boolean },
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

export class Wifi {
  private networks: WifiNetwork[] = [];

  constructor() {
    NodeWifi.init({});
  }

  public refreshNetworks(): Promise<WifiNetwork[]> {
    return new Promise((resolve, reject) => {
      NodeWifi.scan((error: Error | null, networks: NodeWifi.WiFiNetwork[]) => {
        appLogger.debug('node-wifi.scan result', { error, networks });
        if (error) {
          reject(error);
          return;
        }
        this.parseNetworks(networks);
        resolve(this.networks);
      });
    });
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

  /**
   * OS-level adapter check (independent of association / nearby APs).
   * Exported logic kept on the class for tests.
   */
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
    // Unknown platform: fall back to scan (error ⇒ no adapter).
    return new Promise((resolve) => {
      NodeWifi.scan((error: Error | null) => {
        resolve(!error);
      });
    });
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
      const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'interfaces'], {
        windowsHide: true,
        timeout: 5000,
      });
      const lower = stdout.toLowerCase();
      if (lower.includes('no wireless interface') || lower.includes('not running')) {
        return false;
      }
      return /\bname\s*:/i.test(stdout);
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

  private parseNetworks(networks: NodeWifi.WiFiNetwork[]): void {
    this.networks = [];
    for (const network of networks) {
      this.networks.push({
        ssid: network?.ssid || 'unknown',
        mac: network?.mac || '',
        channel: network?.channel || 0,
        frequency: network?.frequency || 0,
        signalLevel: network?.signal_level || 0,
        quality: network?.quality || 0,
        security: this.getNetworkSecurity(network?.security),
      });
    }
  }

  public getNetworks(): WifiNetwork[] {
    return this.networks;
  }

  private getNetworkSecurity(security: string): WifiNetworkSecurity {
    if (!security) return 'UNKNOWN';
    const lowerCaseSecurity = security.toLowerCase();
    if (lowerCaseSecurity.indexOf('wpa3') !== -1) return 'WPA3';
    if (lowerCaseSecurity.indexOf('wpa2') !== -1) return 'WPA2';
    if (lowerCaseSecurity.indexOf('wpa') !== -1) return 'WPA';
    if (lowerCaseSecurity.indexOf('wep') !== -1) return 'WEP';
    if (lowerCaseSecurity.indexOf('open') !== -1 || lowerCaseSecurity.indexOf('none') !== -1) {
      return 'UNSECURED';
    }
    return 'UNKNOWN';
  }
}
