import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/sync', () => ({
    sync: {
        waitForSessionReady: vi.fn(() => Promise.resolve(true)),
        refreshSessionMessages: vi.fn(() => Promise.resolve()),
        refreshSessionMessagesIfStale: vi.fn(() => Promise.resolve()),
    },
}));

import { sync } from '@/sync/sync';
import { OrbitSessionHistoryLoader } from './OrbitSessionHistoryLoader';

describe('OrbitSessionHistoryLoader', () => {
    it('waits for readiness and refreshes history through the session-scoped loader', async () => {
        const loader = new OrbitSessionHistoryLoader('session-1');

        const ready = await loader.waitUntilReady({
            timeoutMs: 1500,
            pollMs: 100,
            allowFallbackRefresh: false,
        });
        await loader.refresh();
        await loader.refreshIfStale();

        expect(ready).toBe(true);
        expect(sync.waitForSessionReady).toHaveBeenCalledWith('session-1', {
            timeoutMs: 1500,
            pollMs: 100,
            allowFallbackRefresh: false,
        });
        expect(sync.refreshSessionMessages).toHaveBeenCalledWith('session-1');
        expect(sync.refreshSessionMessagesIfStale).toHaveBeenCalledWith('session-1');
    });
});
