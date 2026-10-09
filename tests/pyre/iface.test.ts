import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    networkInterfaces: vi.fn(),
    platform: vi.fn(() => 'linux'),
  };
});

describe('pyre iface', () => {
  beforeEach(async () => {
    vi.resetModules();
    const os = await import('node:os');
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.networkInterfaces).mockReturnValue({});
  });

  it('computes broadcast from CIDR prefix', async () => {
    const { broadcastFromPrefix, broadcastForInterface } = await import('../../src/pyre/iface');
    expect(broadcastFromPrefix('192.168.1.10', 24)).toBe('192.168.1.255');
    expect(broadcastForInterface('10.0.0.5', '10.0.0.5/8', null)).toBe('10.255.255.255');
  });

  it('filters public and link-local addresses', async () => {
    const { isPrivateIPv4Use, isLinkLocalIPv4 } = await import('../../src/pyre/iface');
    expect(isPrivateIPv4Use('192.168.0.1')).toBe(true);
    expect(isPrivateIPv4Use('100.64.0.1')).toBe(true);
    expect(isPrivateIPv4Use('8.8.8.8')).toBe(false);
    expect(isLinkLocalIPv4('169.254.1.1')).toBe(true);
  });

  it('selects default-route interface on linux', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Iface\tDestination\tGateway\neth0\t00000000\t0101A8C0\ndocker0\t00000000\t00000000\n',
    );

    const os = await import('node:os');
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [
        {
          address: '192.168.1.50',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:01',
          internal: false,
          cidr: '192.168.1.50/24',
        },
      ],
      docker0: [
        {
          address: '172.17.0.1',
          netmask: '255.255.0.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:02',
          internal: false,
          cidr: '172.17.0.1/16',
        },
      ],
    });

    const { selectInterface } = await import('../../src/pyre/iface');
    const iface = selectInterface();
    expect(iface.name).toBe('eth0');
    expect(iface.address).toBe('192.168.1.50');
    expect(iface.broadcast).toBe('192.168.1.255');
    expect(iface.bindAddress).toBe('192.168.1.255');
    expect(iface.multicast).toBe(false);
  });

  it('lists all interfaces with bus usability flags', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Iface\tDestination\tGateway\neth0\t00000000\t0101A8C0\ndocker0\t00000000\t00000000\n',
    );

    const os = await import('node:os');
    vi.mocked(os.networkInterfaces).mockReturnValue({
      eth0: [
        {
          address: '192.168.1.50',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:01',
          internal: false,
          cidr: '192.168.1.50/24',
        },
      ],
      docker0: [
        {
          address: '172.17.0.1',
          netmask: '255.255.0.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:02',
          internal: false,
          cidr: '172.17.0.1/16',
        },
      ],
      veth0: [
        {
          address: '169.254.0.1',
          netmask: '255.255.0.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:03',
          internal: false,
          cidr: '169.254.0.1/16',
        },
      ],
    });

    const { listNetworkInterfaces } = await import('../../src/pyre/iface');
    const listed = listNetworkInterfaces();
    expect(listed.map((item) => item.name)).toEqual(['docker0', 'eth0', 'veth0']);
    expect(listed.find((item) => item.name === 'eth0')).toMatchObject({
      address: '192.168.1.50',
      usableForBus: true,
      onDefaultRoute: true,
    });
    expect(listed.find((item) => item.name === 'docker0')?.usableForBus).toBe(true);
    expect(listed.find((item) => item.name === 'veth0')?.usableForBus).toBe(false);
  });

  it('falls back to multicast loopback when no candidate exists', async () => {
    const fs = await import('node:fs');
    vi.mocked(fs.readFileSync).mockReturnValue('Iface\tDestination\n');

    const { selectInterface } = await import('../../src/pyre/iface');
    const iface = selectInterface();
    expect(iface).toMatchObject({
      name: 'loopback',
      address: '127.0.0.1',
      broadcast: '225.25.25.25',
      multicast: true,
    });
  });

  it('selects default-route interface on darwin via route get default', async () => {
    const os = await import('node:os');
    const childProcess = await import('node:child_process');
    vi.mocked(os.platform).mockReturnValue('darwin');
    vi.mocked(childProcess.execFileSync).mockReturnValue(
      '   route to: default\ndestination: default\n       interface: en0\n',
    );
    vi.mocked(os.networkInterfaces).mockReturnValue({
      en0: [
        {
          address: '192.168.1.20',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:01',
          internal: false,
          cidr: '192.168.1.20/24',
        },
      ],
      en1: [
        {
          address: '10.0.0.5',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:02',
          internal: false,
          cidr: '10.0.0.5/24',
        },
      ],
    });

    const { selectInterface, getDefaultInterfaceNames } = await import('../../src/pyre/iface');
    expect(getDefaultInterfaceNames()).toEqual(['en0']);
    expect(childProcess.execFileSync).toHaveBeenCalledWith('/sbin/route', ['-n', 'get', 'default'], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const iface = selectInterface();
    expect(iface.name).toBe('en0');
    expect(iface.address).toBe('192.168.1.20');
    // Darwin does not bind to broadcast (linux-only).
    expect(iface.bindAddress).toBeUndefined();
  });

  it('returns empty default interfaces on darwin when route fails', async () => {
    const os = await import('node:os');
    const childProcess = await import('node:child_process');
    vi.mocked(os.platform).mockReturnValue('darwin');
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('route failed');
    });

    const { getDefaultInterfaceNames } = await import('../../src/pyre/iface');
    expect(getDefaultInterfaceNames()).toEqual([]);
  });
});
