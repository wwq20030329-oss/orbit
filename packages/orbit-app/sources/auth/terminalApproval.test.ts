import { describe, expect, it, beforeEach, vi } from 'vitest';

import { decodeBase64, encodeBase64 } from '@/encryption/base64';

const mocks = vi.hoisted(() => ({
  encryptBox: vi.fn((data: Uint8Array) => new Uint8Array([42, ...data])),
  createEncryption: vi.fn(),
}));

vi.mock('@/encryption/libsodium', () => ({
  encryptBox: mocks.encryptBox,
}));

vi.mock('@/sync/encryption/encryption', () => ({
  Encryption: {
    create: mocks.createEncryption,
  },
}));

import { buildTerminalApprovalPayloads } from './terminalApproval';

describe('buildTerminalApprovalPayloads', () => {
  beforeEach(() => {
    mocks.encryptBox.mockClear();
    mocks.createEncryption.mockReset();
  });

  it('derives the content data key locally when sync encryption is not ready', async () => {
    const terminalPublicKey = new Uint8Array([9, 8, 7]);
    const deviceSecret = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
    const derivedContentDataKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => 100 + index));

    mocks.createEncryption.mockResolvedValue({
      contentDataKey: derivedContentDataKey,
    });

    const payloads = await buildTerminalApprovalPayloads(
      encodeBase64(deviceSecret, 'base64url'),
      terminalPublicKey,
    );

    expect(mocks.createEncryption).toHaveBeenCalledTimes(1);
    expect(mocks.createEncryption).toHaveBeenCalledWith(deviceSecret);
    expect(mocks.encryptBox).toHaveBeenCalledTimes(2);
    expect(mocks.encryptBox).toHaveBeenNthCalledWith(1, deviceSecret, terminalPublicKey);
    expect(mocks.encryptBox).toHaveBeenNthCalledWith(
      2,
      new Uint8Array([0, ...derivedContentDataKey]),
      terminalPublicKey,
    );
    expect(payloads.contentDataKey).toEqual(derivedContentDataKey);
    expect(payloads.responseV1).toEqual(new Uint8Array([42, ...deviceSecret]));
    expect(payloads.responseV2).toEqual(new Uint8Array([42, 0, ...derivedContentDataKey]));
  });

  it('reuses the existing sync content data key when it is already available', async () => {
    const terminalPublicKey = new Uint8Array([1, 2, 3]);
    const deviceSecret = decodeBase64('AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA', 'base64url');
    const existingContentDataKey = new Uint8Array(Array.from({ length: 32 }, (_, index) => 255 - index));

    const payloads = await buildTerminalApprovalPayloads(
      encodeBase64(deviceSecret, 'base64url'),
      terminalPublicKey,
      existingContentDataKey,
    );

    expect(mocks.createEncryption).not.toHaveBeenCalled();
    expect(mocks.encryptBox).toHaveBeenCalledTimes(2);
    expect(mocks.encryptBox).toHaveBeenNthCalledWith(1, deviceSecret, terminalPublicKey);
    expect(mocks.encryptBox).toHaveBeenNthCalledWith(
      2,
      new Uint8Array([0, ...existingContentDataKey]),
      terminalPublicKey,
    );
    expect(payloads.contentDataKey).toEqual(existingContentDataKey);
    expect(payloads.responseV2).toEqual(new Uint8Array([42, 0, ...existingContentDataKey]));
  });
});
