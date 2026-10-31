import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wifi } from '../../src/iso/wifi';
import { mockProcessPlatform } from '../helpers/mock-platform';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

describe('Wifi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockProcessPlatform('linux');
  });

  it('parses linux nmcli scan and normalizes security', async () => {
    mockProcessPlatform('linux');
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe('nmcli');
      expect(args).toContain('wifi');
      callback(
        null,
        [
          'yes:Home:AA\\:BB\\:CC\\:DD\\:EE\\:FF:Infra:6:2437:80:WPA2:psk:ccmp',
          'no:Guest:11\\:22\\:33\\:44\\:55\\:66:Infra:1:2412:40:WPA3:sae:ccmp',
          'no:OpenNet:00\\:00\\:00\\:00\\:00\\:01:Infra:11:2462:60:(none)::',
          'no:Legacy:22\\:22\\:22\\:22\\:22\\:22:Infra:2:2417:50:WEP::',
          'no::FF\\:FF\\:FF\\:FF\\:FF\\:FF:Infra:3:2422:10:WPA2::',
        ].join('\n'),
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    const result = await wifi.refreshNetworks();

    expect(result.networks).toHaveLength(4);
    expect(result.currentSsid).toBeNull();
    expect(result.networks[0]).toMatchObject({ ssid: 'Home', security: 'WPA2', channel: 6 });
    expect(result.networks[1]).toMatchObject({ ssid: 'Guest', security: 'WPA3' });
    expect(result.networks[2]).toMatchObject({ ssid: 'OpenNet', security: 'UNSECURED' });
    expect(result.networks[3]).toMatchObject({ ssid: 'Legacy', security: 'WEP' });
    expect(wifi.getNetworks()).toEqual(result.networks);
  });

  it('parses windows netsh scan blocks (UTF-8 via cmd chcp)', async () => {
    mockProcessPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe('cmd.exe');
      expect(args[0]).toBe('/d');
      expect(args[2]).toBe('/c');
      expect(args[3]).toContain('chcp 65001');
      expect(args[3]).toContain('netsh wlan show networks mode=Bssid');
      callback(
        null,
        [
          '',
          'Interface name : Wi-Fi',
          'There are 2 networks currently visible.',
          '',
          'SSID 1 : Café',
          '    Network type            : Infrastructure',
          '    Authentication          : WPA2-Personal',
          '    Encryption              : CCMP',
          '    BSSID 1                 : aa:bb:cc:dd:ee:ff',
          '         Signal             : 80%',
          '         Radio type         : 802.11n',
          '         Channel            : 6',
          '',
          'SSID 2 : Guest',
          '    Network type            : Infrastructure',
          '    Authentication          : WPA3-Personal',
          '    Encryption              : CCMP',
          '    BSSID 1                 : 11:22:33:44:55:66',
          '         Signal             : 40%',
          '         Channel            : 1',
          '',
        ].join('\n'),
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    const result = await wifi.refreshNetworks();
    expect(result.networks).toHaveLength(2);
    expect(result.networks[0]).toMatchObject({
      ssid: 'Café',
      security: 'WPA2',
      channel: 6,
      quality: 80,
      mac: 'aa:bb:cc:dd:ee:ff',
    });
    expect(result.networks[1]).toMatchObject({ ssid: 'Guest', security: 'WPA3' });
  });

  it('parses french-localized netsh wifi scan output', async () => {
    mockProcessPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(
        null,
        [
          'SSID 1 : Maison',
          '    Type de réseau          : Infrastructure',
          '    Authentification        : WPA2-Personal',
          '    Chiffrement             : CCMP',
          '    BSSID 1                 : aa:bb:cc:dd:ee:ff',
          '         Signal             : 70%',
          '         Canal              : 11',
          '',
        ].join('\n'),
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    const result = await wifi.refreshNetworks();
    expect(result.networks).toEqual([
      expect.objectContaining({
        ssid: 'Maison',
        security: 'WPA2',
        channel: 11,
        quality: 70,
        mac: 'aa:bb:cc:dd:ee:ff',
      }),
    ]);
  });

  it('returns empty networks when scan fails (manual form path)', async () => {
    mockProcessPlatform('linux');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error('nmcli missing'), '', '');
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    await expect(wifi.refreshNetworks()).resolves.toEqual({
      networks: [],
      currentSsid: null,
    });
  });

  it('scans darwin networks via airport when available', async () => {
    mockProcessPlatform('darwin');
    const airport =
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe(airport);
      expect(args).toEqual(['-s']);
      callback(
        null,
        [
          '                            SSID BSSID             RSSI CHANNEL HT CC SECURITY (auth/unicast/group)',
          '                      Home Spot aa:bb:cc:dd:ee:ff -45  6       Y  -- WPA2(PSK/AES/AES)',
          '                           Guest 11:22:33:44:55:66 -70  11      Y  -- NONE',
        ].join('\n'),
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    const result = await wifi.refreshNetworks();
    expect(result.networks).toEqual([
      expect.objectContaining({ ssid: 'Home Spot', security: 'WPA2', channel: 6, mac: 'aa:bb:cc:dd:ee:ff' }),
      expect.objectContaining({ ssid: 'Guest', security: 'UNSECURED', channel: 11 }),
    ]);
    expect(result.currentSsid).toBeNull();
  });

  it('falls back to system_profiler when airport is deprecated/empty', async () => {
    mockProcessPlatform('darwin');
    vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (cmd.endsWith('/airport')) {
        callback(
          null,
          '',
          'WARNING: The airport command line tool is deprecated and will be removed in a future release.\n',
        );
        return {} as never;
      }
      expect(cmd).toBe('system_profiler');
      expect(args).toEqual(['-json', 'SPAirPortDataType']);
      callback(
        null,
        JSON.stringify({
          SPAirPortDataType: [
            {
              spairport_airport_interfaces: [
                {
                  spairport_airport_other_local_wireless_networks: [
                    {
                      _name: 'CafeWifi',
                      spairport_network_channel: '36 (5GHz, 80MHz)',
                      spairport_security_mode: 'spairport_security_mode_wpa2_personal',
                      spairport_signal_noise: '-55 dBm / -90 dBm',
                      spairport_network_bssid: 'aa:bb:cc:dd:ee:01',
                    },
                  ],
                  spairport_current_network_information: {
                    _name: 'CafeWifi',
                    spairport_network_channel: '36 (5GHz, 80MHz)',
                    spairport_security_mode: 'spairport_security_mode_wpa2_personal',
                    spairport_signal_noise: '-55 dBm / -90 dBm',
                  },
                },
              ],
            },
          ],
        }),
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    const result = await wifi.refreshNetworks();
    expect(result.networks).toEqual([
      expect.objectContaining({
        ssid: 'CafeWifi',
        security: 'WPA2',
        channel: 36,
        mac: 'aa:bb:cc:dd:ee:01',
      }),
    ]);
  });

  it('falls back to current darwin SSID when scan is empty', async () => {
    mockProcessPlatform('darwin');
    vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('no airport'));
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (cmd === 'system_profiler') {
        callback(null, JSON.stringify({ SPAirPortDataType: [] }), '');
        return {} as never;
      }
      if (cmd === 'networksetup' && args[0] === '-listallhardwareports') {
        callback(null, 'Hardware Port: Wi-Fi\nDevice: en0\n', '');
        return {} as never;
      }
      if (cmd === 'networksetup' && args[0] === '-getairportnetwork') {
        callback(null, 'Current Wi-Fi Network: HomeSpot\n', '');
        return {} as never;
      }
      callback(new Error(`unexpected ${cmd}`), '', '');
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    await expect(wifi.refreshNetworks()).resolves.toEqual({
      networks: [],
      currentSsid: 'HomeSpot',
    });
    expect(wifi.getCurrentSsid()).toBe('HomeSpot');
  });

  it('falls back to current windows SSID when scan is empty', async () => {
    mockProcessPlatform('win32');
    let call = 0;
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe('cmd.exe');
      call += 1;
      if (call === 1) {
        expect(args[3]).toContain('netsh wlan show networks mode=Bssid');
        callback(null, 'Interface name : Wi-Fi\nThere are 0 networks currently visible.\n', '');
        return {} as never;
      }
      expect(args[3]).toContain('netsh wlan show interfaces');
      callback(
        null,
        'Name                   : Wi-Fi\nSSID                   : OfficeHotspot\nBSSID                  : aa:bb\nState                  : connected\n',
        '',
      );
      return {} as never;
    }) as never);

    const wifi = new Wifi();
    await expect(wifi.refreshNetworks()).resolves.toEqual({
      networks: [],
      currentSsid: 'OfficeHotspot',
    });
  });

  it('detects linux wifi adapter via /sys wireless marker', async () => {
    mockProcessPlatform('linux');
    vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['enp3s0', 'wlp2s0'] as never);
    vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
      const wirelessMarker = path.join('wlp2s0', 'wireless');
      if (String(target).includes(wirelessMarker)) {
        return;
      }
      throw new Error('missing');
    });

    await expect(new Wifi().hasWifi()).resolves.toBe(true);
  });

  it('returns false on linux desktop without wifi adapter', async () => {
    mockProcessPlatform('linux');
    vi.spyOn(fs.promises, 'readdir').mockResolvedValue(['enp3s0', 'lo', 'docker0'] as never);
    vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('missing'));

    await expect(new Wifi().hasWifi()).resolves.toBe(false);
  });

  it('detects darwin wifi adapter via networksetup Wi-Fi port', async () => {
    mockProcessPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe('networksetup');
      expect(args).toEqual(['-listallhardwareports']);
      callback(
        null,
        'Hardware Port: Ethernet\nDevice: en0\n\nHardware Port: Wi-Fi\nDevice: en1\n',
        '',
      );
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(true);
  });

  it('detects darwin Airport hardware port name', async () => {
    mockProcessPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'Hardware Port: AirPort\nDevice: en0\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().detectWifiAdapter()).resolves.toBe(true);
  });

  it('detects darwin WiFi port without hyphen', async () => {
    mockProcessPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'Hardware Port: WiFi\nDevice: en0\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().detectWifiAdapter()).resolves.toBe(true);
  });

  it('returns false on darwin when networksetup finds no wifi port', async () => {
    mockProcessPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'Hardware Port: Ethernet\nDevice: en0\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(false);
  });

  it('returns false on darwin when networksetup fails', async () => {
    mockProcessPlatform('darwin');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error('networksetup missing'), '', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(false);
  });

  it('detects windows wifi adapter via netsh interfaces', async () => {
    mockProcessPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      expect(cmd).toBe('cmd.exe');
      expect(args[3]).toContain('netsh wlan show interfaces');
      callback(null, 'Name                   : Wi-Fi\nState                  : connected\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(true);
  });

  it('detects windows wifi adapter with french interface labels', async () => {
    mockProcessPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'Nom                    : Wi-Fi\nÉtat                   : connecté\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(true);
  });

  it('returns false on windows when netsh reports no wireless interface', async () => {
    mockProcessPlatform('win32');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, 'There is no wireless interface on the system.\n', '');
      return {} as never;
    }) as never);

    await expect(new Wifi().hasWifi()).resolves.toBe(false);
  });
});
