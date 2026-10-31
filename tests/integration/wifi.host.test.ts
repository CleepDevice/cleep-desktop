/**
 * Host-level WiFi integration checks.
 *
 * Run on real OS runners (CI matrix: Linux / Windows / macOS). Assertions stay soft:
 * cloud VMs often have no WiFi radio, Location may block scans, airport may be gone.
 * We only require: tools behave without throwing, and payloads keep a stable shape.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { Wifi } from '../../src/iso/wifi';

const DARWIN_AIRPORT =
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';

function execFileAsync(
  file: string,
  args: readonly string[],
  timeout = 30000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, [...args], { timeout, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        code: error && typeof (error as NodeJS.ErrnoException).code === 'number'
          ? ((error as NodeJS.ErrnoException).code as unknown as number)
          : error
            ? 1
            : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

describe('Wifi host integration', () => {
  it('hasWifi returns a boolean without throwing', async () => {
    await expect(new Wifi().hasWifi()).resolves.toEqual(expect.any(Boolean));
  });

  it('refreshNetworks returns a structured result without throwing', async () => {
    const result = await new Wifi().refreshNetworks();
    expect(Array.isArray(result.networks)).toBe(true);
    expect(result.currentSsid === null || typeof result.currentSsid === 'string').toBe(true);

    for (const network of result.networks) {
      expect(network.ssid.length).toBeGreaterThan(0);
      expect(['WPA', 'WPA2', 'WPA3', 'WEP', 'UNSECURED', 'UNKNOWN']).toContain(network.security);
      expect(typeof network.channel).toBe('number');
      expect(typeof network.quality).toBe('number');
    }
  });

  it.runIf(process.platform === 'linux')(
    'nmcli is present or wifi scan soft-fails cleanly',
    async () => {
      const which = await execFileAsync('which', ['nmcli'], 5000);
      if (which.code !== 0) {
        // Minimal containers may lack NetworkManager — Wifi must still soft-fail.
        const result = await new Wifi().refreshNetworks();
        expect(result.networks).toEqual([]);
        return;
      }
      const list = await execFileAsync(
        'nmcli',
        ['-t', '-f', 'SSID', 'device', 'wifi', 'list'],
        20000,
      );
      // Prefer success; some headless images return non-zero without a radio — still must respond.
      expect(typeof list.stdout).toBe('string');
      expect(typeof list.stderr).toBe('string');
    },
  );

  it.runIf(process.platform === 'win32')('netsh wlan show interfaces is callable', async () => {
    const result = await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', 'chcp 65001 >nul && netsh wlan show interfaces'],
      15000,
    );
    // netsh itself must run; "no wireless interface" / Location denial are acceptable outcomes.
    expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    expect(
      /wireless|wi-?fi|interface|location|access|ssid|name|nom/i.test(
        `${result.stdout}\n${result.stderr}`,
      ),
    ).toBe(true);
  });

  it.runIf(process.platform === 'darwin')(
    'system_profiler SPAirPortDataType returns JSON',
    async () => {
      const result = await execFileAsync(
        'system_profiler',
        ['-json', 'SPAirPortDataType'],
        60000,
      );
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout) as { SPAirPortDataType?: unknown };
      expect(parsed).toHaveProperty('SPAirPortDataType');
    },
  );

  it.runIf(process.platform === 'darwin')(
    'airport -s is used only when the binary still exists',
    async () => {
      const present = await pathExists(DARWIN_AIRPORT);
      if (!present) {
        // Expected on modern macOS CI images after airport removal.
        expect(present).toBe(false);
        return;
      }
      const result = await execFileAsync(DARWIN_AIRPORT, ['-s'], 20000);
      // Deprecated builds print a warning and may return empty — still must not crash the process badly.
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
    },
  );

  it.runIf(process.platform === 'darwin')('networksetup can list hardware ports', async () => {
    const result = await execFileAsync('networksetup', ['-listallhardwareports'], 10000);
    expect(result.code).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });
});
