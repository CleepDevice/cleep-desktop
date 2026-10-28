import { net } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeRemoteUrlRefresh,
  parseRemoteUrlRefreshPayload,
  vaultKeyForRemoteRefresh,
} from '../../src/remote-url-refresh';
import type { RemoteUrlRefreshDescriptor } from '../../src/cleepbus/cleepbus.types';

describe('remote-url-refresh', () => {
  beforeEach(() => {
    vi.mocked(net.fetch).mockReset();
  });

  it('builds a stable vault key', () => {
    expect(vaultKeyForRemoteRefresh('dev-1', 'ngrok')).toBe('remote-refresh:dev-1:ngrok');
  });

  it('parses null as unsupported', () => {
    expect(parseRemoteUrlRefreshPayload(null)).toEqual({
      entry: { supported: false },
      secret: null,
    });
  });

  it('parses a valid descriptor + secret', () => {
    const parsed = parseRemoteUrlRefreshPayload({
      descriptor: {
        version: 1,
        method: 'GET',
        url: 'https://api.ngrok.com/endpoints',
        query: { filter: "name=='cleep'" },
        headers: { Authorization: 'Bearer {{secret}}' },
        extract: { list: 'endpoints', url: 'url' },
      },
      secret: 'api-key',
    });
    expect(parsed?.secret).toBe('api-key');
    expect(parsed?.entry).toMatchObject({
      supported: true,
      descriptor: {
        method: 'GET',
        url: 'https://api.ngrok.com/endpoints',
      },
    });
  });

  it('rejects missing secret as unsupported', () => {
    expect(
      parseRemoteUrlRefreshPayload({
        descriptor: {
          version: 1,
          method: 'GET',
          url: 'https://api.ngrok.com/endpoints',
        },
      }),
    ).toEqual({ entry: { supported: false }, secret: null });
  });

  it('executes GET descriptor and extracts https URL', async () => {
    vi.mocked(net.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        endpoints: [{ url: 'https://abc.ngrok-free.app' }],
      }),
    } as unknown as Response);

    const descriptor: RemoteUrlRefreshDescriptor = {
      version: 1,
      method: 'GET',
      url: 'https://api.ngrok.com/endpoints',
      query: { filter: "name=='cleep'" },
      headers: { Authorization: 'Bearer {{secret}}' },
      extract: { list: 'endpoints', url: 'url' },
    };

    const publicUrl = await executeRemoteUrlRefresh(descriptor, 'secret-token');
    expect(publicUrl).toBe('https://abc.ngrok-free.app');
    expect(net.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.ngrok.com/endpoints'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      }),
    );
  });

  it('refuses non-https descriptor URLs', async () => {
    await expect(
      executeRemoteUrlRefresh(
        {
          version: 1,
          method: 'GET',
          url: 'http://api.example.com/endpoints',
        },
        'secret',
      ),
    ).rejects.toThrow(/HTTPS/);
  });

  it('includes provider error detail on HTTP failure', async () => {
    vi.mocked(net.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({
        error_code: 'invalid_cel_expression',
        msg: 'Invalid CEL query',
      }),
    } as unknown as Response);

    await expect(
      executeRemoteUrlRefresh(
        {
          version: 1,
          method: 'GET',
          url: 'https://api.ngrok.com/endpoints',
          query: { filter: 'obj.name == "cleep"' },
        },
        'secret',
      ),
    ).rejects.toThrow(/HTTP 400: Invalid CEL query/);
  });

  it('fails when provider has no active endpoint', async () => {
    vi.mocked(net.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ endpoints: [] }),
    } as unknown as Response);

    await expect(
      executeRemoteUrlRefresh(
        {
          version: 1,
          method: 'GET',
          url: 'https://api.ngrok.com/endpoints',
          extract: { list: 'endpoints', url: 'url' },
        },
        'secret',
      ),
    ).rejects.toThrow(/No active public URL/);
  });
});
