import { describe, expect, it } from 'vitest';
import {
  INVOKE_CHANNELS,
  SEND_CHANNELS,
} from '../../src/ipc/ipc-channels';
import {
  INVOKE_REQUEST_SCHEMAS,
  SEND_PAYLOAD_SCHEMAS,
  parseInvokeRequest,
  parseSendPayload,
} from '../../src/ipc/ipc-validate';

describe('ipc-validate', () => {
  it('maps every invoke/send channel to a schema or null', () => {
    for (const channel of INVOKE_CHANNELS) {
      expect(channel in INVOKE_REQUEST_SCHEMAS).toBe(true);
    }
    for (const channel of SEND_CHANNELS) {
      expect(channel in SEND_PAYLOAD_SCHEMAS).toBe(true);
    }
  });

  it('accepts void invoke channels without a payload', () => {
    expect(parseInvokeRequest('devices-get-ui-state', undefined).ok).toBe(true);
  });

  it('rejects path traversal on cache-delete-file', () => {
    const bad = parseInvokeRequest('cache-delete-file', '../secret.txt');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.message).toMatch(/basename|path/i);
    }
    expect(parseInvokeRequest('cache-delete-file', 'image.zip').ok).toBe(true);
  });

  it('validates settings-set-all as a plain object', () => {
    expect(parseInvokeRequest('settings-set-all', { cleep: { debug: true } }).ok).toBe(true);
    expect(parseInvokeRequest('settings-set-all', ['nope']).ok).toBe(false);
    expect(parseInvokeRequest('settings-set-all', null).ok).toBe(false);
  });

  it('validates iso-start-install install data', () => {
    const valid = parseSendPayload('iso-start-install', {
      isoUrl: 'https://example.com/cleep.zip',
      isoSha256: 'a'.repeat(64),
      isoFilename: 'cleep.zip',
      drivePath: '/dev/sda',
      wifiData: null,
    });
    expect(valid.ok).toBe(true);

    const local = parseSendPayload('iso-start-install', {
      isoUrl: 'file:///tmp/local.iso',
      isoSha256: undefined,
      isoFilename: 'local.iso',
      drivePath: '/dev/sdb',
      wifiData: {
        network: 'home',
        security: 'wpa',
        password: 'secret',
        hidden: false,
      },
    });
    expect(local.ok).toBe(true);

    const traversal = parseSendPayload('iso-start-install', {
      isoUrl: 'https://example.com/cleep.zip',
      isoSha256: 'a'.repeat(64),
      isoFilename: '../../evil.zip',
      drivePath: '/dev/sda',
      wifiData: null,
    });
    expect(traversal.ok).toBe(false);

    const badUrl = parseSendPayload('iso-start-install', {
      isoUrl: 'javascript:alert(1)',
      isoSha256: 'a'.repeat(64),
      isoFilename: 'cleep.zip',
      drivePath: '/dev/sda',
      wifiData: null,
    });
    expect(badUrl.ok).toBe(false);
  });

  it('rejects non-http(s) URLs for open-url-in-browser and download-file', () => {
    expect(parseSendPayload('open-url-in-browser', 'https://cleep.io').ok).toBe(true);
    expect(parseSendPayload('open-url-in-browser', 'file:///etc/passwd').ok).toBe(false);
    expect(parseSendPayload('download-file', { url: 'https://device/file.bin' }).ok).toBe(true);
    expect(parseSendPayload('download-file', { url: 'ftp://evil/file' }).ok).toBe(false);
  });

  it('validates update-device-auth', () => {
    expect(
      parseInvokeRequest('update-device-auth', {
        url: 'https://192.168.1.10',
        deviceUuid: 'uuid',
        account: 'admin',
        password: 'x',
      }).ok,
    ).toBe(true);
    expect(parseInvokeRequest('update-device-auth', { url: 'https://x' }).ok).toBe(false);
  });
});
