import { beforeEach, describe, expect, it, vi } from 'vitest';

import axios from 'axios';

import { authApprove } from './authApprove';

vi.mock('axios');
vi.mock('@/sync/serverConfig', () => ({
  getServerUrl: () => 'http://orbit.test',
}));

const mockedAxios = vi.mocked(axios, true);

describe('authApprove', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws when the terminal auth request does not exist anymore', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'not_found',
        supportsV2: true,
      },
    });

    await expect(
      authApprove('token', new Uint8Array([1, 2, 3]), new Uint8Array([4]), new Uint8Array([5])),
    ).rejects.toThrow('Terminal auth request not found or expired');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('submits the encrypted response while the request is pending', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        status: 'pending',
        supportsV2: true,
      },
    });
    mockedAxios.post.mockResolvedValue({ data: { success: true } });

    await authApprove(
      'token',
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5]),
      new Uint8Array([6, 7]),
    );

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://orbit.test/v1/auth/response',
      expect.objectContaining({
        publicKey: expect.any(String),
        response: expect.any(String),
      }),
      {
        headers: {
          Authorization: 'Bearer token',
        },
      },
    );
  });
});
