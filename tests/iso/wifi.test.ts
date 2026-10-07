import fs from 'fs';
import * as NodeWifi from 'node-wifi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wifi } from '../../src/iso/wifi';

vi.mock('node-wifi');

describe('Wifi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(NodeWifi.init).mockImplementation(() => undefined);
  });

  it('parses scanned networks and normalizes security', async () => {
    vi.mocked(NodeWifi.scan).mockImplementation((callback) => {
      callback(null, [
        {
          ssid: 'Home',
          bssid: 'aa:bb',
          mac: 'aa:bb:cc:dd:ee:ff',
          channel: 6,
          frequency: 2437,
          signal_level: -40,
          quality: 80,
          security: 'WPA2 PSK',
          security_flags: [],
          mode: 'Unknown',
        },
        {
          ssid: 'Guest',
          bssid: '11:22',
          mac: '11:22:33:44:55:66',
          channel: 1,
          frequency: 2412,
          signal_level: -70,
          quality: 40,
          security: 'WPA3 SAE',
          security_flags: [],
          mode: 'Unknown',
        },
        {
          ssid: 'OpenNet',
          bssid: '00:00',
          mac: '',
          channel: 11,
          frequency: 2462,
          signal_level: -55,
          quality: 60,
          security: 'Open',
          security_flags: [],
          mode: 'Unknown',
        },
        {
          ssid: 'Legacy',
          bssid: '22:22',
          mac: '22:22',
          channel: 2,
          frequency: 2417,
          signal_level: -50,
          quality: 50,
          security: 'WEP',
          security_flags: [],
          mode: 'Unknown',
        },
        {
          ssid: '',
          bssid: '',
          mac: undefined as unknown as string,
          channel: undefined as unknown as number,
          frequency: undefined as unknown as number,
          signal_level: undefined as unknown as number,
          quality: undefined as unknown as number,
          security: '',
          security_flags: [],
          mode: 'Unknown',
        },
      ]);
    });

    const wifi = new Wifi();
    const networks = await wifi.refreshNetworks();

    expect(networks).toHaveLength(5);
    expect(networks[0]).toMatchObject({ ssid: 'Home', security: 'WPA2' });
    expect(networks[1]).toMatchObject({ ssid: 'Guest', security: 'WPA3' });
    expect(networks[2]).toMatchObject({ ssid: 'OpenNet', security: 'UNSECURED' });
    expect(networks[3]).toMatchObject({ ssid: 'Legacy', security: 'WEP' });
    expect(networks[4]).toMatchObject({ ssid: 'unknown', security: 'UNKNOWN', mac: '' });
    expect(wifi.getNetworks()).toEqual(networks);
  });

  it('rejects when scan fails', async () => {
    vi.mocked(NodeWifi.scan).mockImplementation((callback) => {
      callback(new Error('no wifi adapter'), []);
    });

    const wifi = new Wifi();
    await expect(wifi.refreshNetworks()).rejects.toThrow('no wifi adapter');
  });

  it('detects linux wifi adapter via /sys wireless marker', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['enp3s0', 'wlp2s0'] as never);
    vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
      if (String(target).includes('wlp2s0/wireless')) {
        return;
      }
      throw new Error('missing');
    });

    await expect(new Wifi().hasWifi()).resolves.toBe(true);
  });

  it('returns false on linux desktop without wifi adapter', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['enp3s0', 'lo', 'docker0'] as never);
    vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('missing'));

    await expect(new Wifi().hasWifi()).resolves.toBe(false);
  });
});
