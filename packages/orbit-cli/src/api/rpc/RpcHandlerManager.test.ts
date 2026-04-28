import { describe, expect, it, vi } from 'vitest';

import { decodeBase64, decrypt, encodeBase64, encrypt } from '@/api/encryption';

import { RpcHandlerManager } from './RpcHandlerManager';

describe('RpcHandlerManager', () => {
    it('normalizes undefined handler responses to true so command RPCs stay decryptable', async () => {
        const key = new Uint8Array(32).fill(7);
        const manager = new RpcHandlerManager({
            scopePrefix: 'session-1',
            encryptionKey: key,
            encryptionVariant: 'legacy',
            logger: vi.fn(),
        });

        manager.registerHandler('abort', async () => undefined);

        const encryptedResponse = await manager.handleRequest({
            method: 'session-1:abort',
            params: encodeBase64(encrypt(key, 'legacy', { reason: 'stop' })),
        });

        expect(
            decrypt(key, 'legacy', decodeBase64(encryptedResponse)),
        ).toBe(true);
    });
});
