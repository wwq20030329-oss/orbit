import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

vi.mock('@/text', () => ({
    t: (key: string, values?: Record<string, unknown>) => {
        if (key === 'status.lastSeen') {
            return `lastSeen:${String(values?.time ?? '')}`;
        }
        return key;
    },
}));

vi.mock('./presence', () => ({
    isSessionLikelyOnline: vi.fn(),
}));

vi.mock('./sessionInteraction', () => ({
    isSessionInteractionBlocked: vi.fn(),
}));

import { isSessionLikelyOnline } from './presence';
import { isSessionInteractionBlocked } from './sessionInteraction';
import { getSessionStatus } from './sessionStatus';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
            flavor: 'codex',
            lifecycleState: 'running',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

describe('getSessionStatus', () => {
    it('returns disconnected when interaction is blocked', () => {
        vi.mocked(isSessionInteractionBlocked).mockReturnValue(true);
        vi.mocked(isSessionLikelyOnline).mockReturnValue(true);

        const status = getSessionStatus(createSession(), { sessionId: 'session-1' });

        expect(status).toEqual({
            state: 'disconnected',
            isConnected: false,
            statusText: 'lastSeen:Jan 1, 1970',
            shouldShowStatus: true,
            statusColor: '#999',
            statusDotColor: '#999',
        });
    });

    it('returns permission_required before thinking when approvals are pending', () => {
        vi.mocked(isSessionInteractionBlocked).mockReturnValue(false);
        vi.mocked(isSessionLikelyOnline).mockReturnValue(true);

        const status = getSessionStatus(createSession({
            thinking: true,
            agentState: {
                requests: {
                    req1: {
                        tool: 'exec',
                        arguments: {},
                        createdAt: 1,
                    },
                },
                completedRequests: null,
                controlledByUser: null,
            },
        }));

        expect(status).toEqual({
            state: 'permission_required',
            isConnected: true,
            statusText: 'status.permissionRequired',
            shouldShowStatus: true,
            statusColor: '#FF9500',
            statusDotColor: '#FF9500',
            isPulsing: true,
        });
    });
});
