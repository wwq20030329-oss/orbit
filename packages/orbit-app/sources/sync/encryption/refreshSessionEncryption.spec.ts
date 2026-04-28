import { describe, expect, it, vi } from 'vitest';

import { refreshSessionEncryptionCache } from './refreshSessionEncryption';

describe('refreshSessionEncryptionCache', () => {
    it('replaces an existing session encryption entry by clearing stale cache first', () => {
        const sessionEncryptions = new Map<string, unknown>([
            ['session-1', { stale: true }],
        ]);
        const cache = {
            clearSessionCache: vi.fn(),
        };

        refreshSessionEncryptionCache(sessionEncryptions, cache, 'session-1');

        expect(sessionEncryptions.has('session-1')).toBe(false);
        expect(cache.clearSessionCache).toHaveBeenCalledWith('session-1');
    });

    it('does nothing when the session encryption does not exist yet', () => {
        const sessionEncryptions = new Map<string, unknown>();
        const cache = {
            clearSessionCache: vi.fn(),
        };

        refreshSessionEncryptionCache(sessionEncryptions, cache, 'session-2');

        expect(cache.clearSessionCache).not.toHaveBeenCalled();
    });
});
