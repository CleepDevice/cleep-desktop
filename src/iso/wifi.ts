import { appLogger } from '../app-logger';
import * as NodeWifi from 'node-wifi';

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
  private networks: WifiNetwork[];

  constructor() {
    NodeWifi.init({});
  }

  public refreshNetworks(): Promise<WifiNetwork[]> {
    return new Promise((resolve, reject) => {
      NodeWifi.scan((error: Error | null, networks: NodeWifi.WiFiNetwork[]) => {
        appLogger.debug('node-wifi.scan result', { error, networks });
        if (error) {
          reject(error);
        }
        this.parseNetworks(networks);
        resolve(this.networks);
      });
    });
  }

  public hasWifi(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      NodeWifi.getCurrentConnections((error: Error | null, connections: NodeWifi.WiFiNetwork[]) => {
        appLogger.debug('node-wifi.getCurrentConnections result', { error, connections });
        if (error) {
          reject(error);
        }
        resolve(connections?.length > 0);
      });
    });
  }

  private parseNetworks(networks: NodeWifi.WiFiNetwork[]): void {
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
    if (lowerCaseSecurity.indexOf('open') !== -1) return 'UNSECURED';
    return 'UNKNOWN';
  }
}
