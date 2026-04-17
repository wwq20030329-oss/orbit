import { describe, expect, it } from 'vitest';

import { buildLegacySessionListData } from './legacySessionListData';
import type { Session } from './storageTypes';

function createSession(overrides: Partial<Session> = {}): Session {
    const now = Date.now();

    return {
        id: 'session-1',
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active: true,
        activeAt: now,
        metadata: {
            path: '/tmp/project',
            host: 'host',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        draft: null,
        permissionMode: 'default',
        ...overrides,
    };
}

describe('buildLegacySessionListData', () => {
    it('groups online sessions before offline sessions and sorts both groups by createdAt descending', () => {
        const newestOnline = createSession({
            id: 'online-new',
            createdAt: 400,
            updatedAt: 400,
            active: true,
            activeAt: Date.now(),
        });
        const olderOnline = createSession({
            id: 'online-old',
            createdAt: 200,
            updatedAt: 200,
            active: true,
            activeAt: Date.now(),
        });
        const newestOffline = createSession({
            id: 'offline-new',
            createdAt: 300,
            updatedAt: 300,
            active: false,
            activeAt: 10,
            presence: 10,
        });
        const olderOffline = createSession({
            id: 'offline-old',
            createdAt: 100,
            updatedAt: 100,
            active: false,
            activeAt: 5,
            presence: 5,
        });

        expect(buildLegacySessionListData([
            olderOffline,
            olderOnline,
            newestOffline,
            newestOnline,
        ])).toEqual([
            'online',
            newestOnline,
            olderOnline,
            'offline',
            newestOffline,
            olderOffline,
        ]);
    });

    it('omits empty online and offline sections', () => {
        const offlineOnly = createSession({
            id: 'offline-only',
            active: false,
            activeAt: 1,
            presence: 1,
        });
        const onlineOnly = createSession({
            id: 'online-only',
            active: true,
            activeAt: Date.now(),
        });

        expect(buildLegacySessionListData([offlineOnly])).toEqual([
            'offline',
            offlineOnly,
        ]);

        expect(buildLegacySessionListData([onlineOnly])).toEqual([
            'online',
            onlineOnly,
        ]);

        expect(buildLegacySessionListData([])).toEqual([]);
    });
});
