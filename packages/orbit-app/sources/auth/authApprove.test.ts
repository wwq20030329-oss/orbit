import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApprove } from './authApprove';

vi.mock('@/sync/serverConfig', () => ({
  getServerUrl: () => 'http://orbit.test',
  ensureReachableServerUrl: async () => 'http://orbit.test',
}));

describe('authApprove', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('throws when the terminal auth request does not exist anymore', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'not_found',
        supportsV2: true,
      }),
    } as Response);

    await expect(
      authApprove('token', new Uint8Array([1, 2, 3]), new Uint8Array([4]), new Uint8Array([5])),
    ).rejects.toThrow('Terminal auth request not found or expired');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('submits the encrypted response while the request is pending', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'pending',
          supportsV2: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      } as Response);

    await authApprove(
      'token',
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5]),
      new Uint8Array([6, 7]),
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(global.fetch).mock.calls[1]?.[0]).toBe('http://orbit.test/v1/auth/response');
    expect(vi.mocked(global.fetch).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      }),
    );
  });

  it('falls back to V1 approval when the app could not build a V2 payload', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'pending',
          supportsV2: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      } as Response);

    await authApprove(
      'token',
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5]),
      null as unknown as Uint8Array,
    );

    const postOptions = vi.mocked(global.fetch).mock.calls[1]?.[1] as RequestInit;
    expect(postOptions).toBeDefined();
    expect(postOptions.body).toContain('"response":"BAU="');
  });
});
