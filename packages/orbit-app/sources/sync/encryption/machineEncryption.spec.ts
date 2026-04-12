import { describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from '@/encryption/base64';
import { EncryptionCache } from './encryptionCache';
import { MachineEncryption } from './machineEncryption';
import type { Decryptor, Encryptor } from './encryptor';

describe('MachineEncryption', () => {
    it('returns null for invalid machine metadata without surfacing a console error', async () => {
        const decrypt = vi.fn(async () => [{
            host: 'orbit-host',
            platform: 'darwin',
            homeDir: '/Users/test'
        }]);
        const encryption = new MachineEncryption(
            'machine-1',
            { encrypt: vi.fn(), decrypt } as unknown as Encryptor & Decryptor,
            new EncryptionCache()
        );
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await encryption.decryptMetadata(1, encodeBase64(new Uint8Array([1, 2, 3]), 'base64'));

        expect(result).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('caches valid machine metadata after the first successful decrypt', async () => {
        const decrypt = vi.fn(async () => [{
            host: 'orbit-host',
            platform: 'darwin',
            orbitCliVersion: '1.0.0',
            orbitHomeDir: '/Users/test/.orbit',
            homeDir: '/Users/test'
        }]);
        const encryption = new MachineEncryption(
            'machine-2',
            { encrypt: vi.fn(), decrypt } as unknown as Encryptor & Decryptor,
            new EncryptionCache()
        );
        const payload = encodeBase64(new Uint8Array([4, 5, 6]), 'base64');

        const first = await encryption.decryptMetadata(2, payload);
        const second = await encryption.decryptMetadata(2, payload);

        expect(first).toEqual(second);
        expect(decrypt).toHaveBeenCalledTimes(1);
    });

    it('preserves false for raw RPC responses instead of treating it as a decrypt failure', async () => {
        const encryption = new MachineEncryption(
            'machine-3',
            {
                encrypt: vi.fn(),
                decrypt: vi.fn(async () => [false]),
            } as unknown as Encryptor & Decryptor,
            new EncryptionCache(),
        );

        const result = await encryption.decryptRaw(encodeBase64(new Uint8Array([7, 8, 9]), 'base64'));

        expect(result).toBe(false);
    });
});
