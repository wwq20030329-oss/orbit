import { describe, expect, it, vi } from 'vitest';

import { encodeBase64 } from '@/encryption/base64';

import { EncryptionCache } from './encryptionCache';
import { SessionEncryption } from './sessionEncryption';
import type { Decryptor, Encryptor } from './encryptor';

describe('SessionEncryption', () => {
    it('preserves false when decrypting raw RPC responses', async () => {
        const encryption = new SessionEncryption(
            'session-1',
            {
                encrypt: vi.fn(),
                decrypt: vi.fn(async () => [false]),
            } as unknown as Encryptor & Decryptor,
            new EncryptionCache(),
        );

        const result = await encryption.decryptRaw(encodeBase64(new Uint8Array([1, 2, 3]), 'base64'));

        expect(result).toBe(false);
    });
});
