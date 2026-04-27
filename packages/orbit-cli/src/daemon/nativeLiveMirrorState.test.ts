import { describe, expect, it, vi } from 'vitest';

import { pruneNativeLiveMirrorClients } from './nativeLiveMirrorState';

describe('pruneNativeLiveMirrorClients', () => {
    it('closes stale mirror clients and clears their replay counts', async () => {
        const activeClient = {
            sendSessionDeath: vi.fn(),
            flush: vi.fn(async () => {}),
            close: vi.fn(async () => {}),
        };
        const staleClient = {
            sendSessionDeath: vi.fn(),
            flush: vi.fn(async () => {}),
            close: vi.fn(async () => {}),
        };

        const clients = new Map([
            ['active', activeClient],
            ['stale', staleClient],
        ]);
        const counts = new Map([
            ['active', 3],
            ['stale', 8],
        ]);

        await pruneNativeLiveMirrorClients(new Set(['active']), clients, counts);

        expect(clients.has('active')).toBe(true);
        expect(clients.has('stale')).toBe(false);
        expect(counts.get('active')).toBe(3);
        expect(counts.has('stale')).toBe(false);
        expect(staleClient.sendSessionDeath).toHaveBeenCalledTimes(1);
        expect(staleClient.flush).toHaveBeenCalledTimes(1);
        expect(staleClient.close).toHaveBeenCalledTimes(1);
        expect(activeClient.sendSessionDeath).not.toHaveBeenCalled();
    });
});
