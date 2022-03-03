import { appLogger } from './app-logger';
import { wifi, WifiNetwork } from './iso/wifi';

class AppIso {
  private wifiNetworks: WifiNetwork[] = [];

  public async refreshWifiNetworks() {
    try {
      this.wifiNetworks = await wifi.refreshNetworks();
    } catch (error) {
      appLogger.error('Unable to get wifi networks', { error });
    }
  }

  public getWifiNetworks(): WifiNetwork[] {
    return this.wifiNetworks;
  }
}

export const appIso = new AppIso();
