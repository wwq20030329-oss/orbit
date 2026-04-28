import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
    getSessionStatus: vi.fn(),
    isSessionInteractionBlocked: vi.fn(),
    useSessionStatus: vi.fn(),
}));

vi.mock('./sessionUtils', () => ({
    getSessionStatus: hoisted.getSessionStatus,
    useSessionStatus: hoisted.useSessionStatus,
}));

vi.mock('./sessionStatus', () => ({
    getSessionStatus: hoisted.getSessionStatus,
    useSessionStatus: hoisted.useSessionStatus,
}));

vi.mock('./sessionInteraction', () => ({
    isSessionInteractionBlocked: hoisted.isSessionInteractionBlocked,
}));

import { didSessionControlReturnToApp, getSessionControlState } from './sessionControlState';

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

describe('didSessionControlReturnToApp', () => {
    it('returns true when control switches from terminal to app', () => {
        expect(didSessionControlReturnToApp(
            { controlledByUser: true },
            { controlledByUser: false },
        )).toBe(true);
    });

    it('returns false when session remains app-controlled', () => {
        expect(didSessionControlReturnToApp(
            { controlledByUser: false },
            { controlledByUser: false },
        )).toBe(false);
    });

    it('returns false when session becomes terminal-controlled', () => {
        expect(didSessionControlReturnToApp(
            { controlledByUser: false },
            { controlledByUser: true },
        )).toBe(false);
    });
});

describe('getSessionControlState', () => {
    beforeEach(() => {
        hoisted.getSessionStatus.mockReset();
        hoisted.isSessionInteractionBlocked.mockReset();
        hoisted.useSessionStatus.mockReset();

        hoisted.isSessionInteractionBlocked.mockReturnValue(false);
        hoisted.getSessionStatus.mockReturnValue({
            state: 'waiting',
            isConnected: true,
            statusText: 'online',
            shouldShowStatus: false,
            statusColor: '#34C759',
            statusDotColor: '#34C759',
        });
    });

    it('returns a connected live control state for interactive sessions', () => {
        const session = createSession();
        const controlState = getSessionControlState(session, { sessionId: session.id });

        expect(controlState).toEqual({
            interactionBlocked: false,
            isArchivedSession: false,
            isConnected: true,
            isDisconnected: false,
            isInactiveArchivedSession: false,
            status: {
                state: 'waiting',
                isConnected: true,
                statusText: 'online',
                shouldShowStatus: false,
                statusColor: '#34C759',
                statusDotColor: '#34C759',
            },
        });
    });

    it('marks archived offline sessions as inactive archived', () => {
        const session = createSession({
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                flavor: 'codex',
                lifecycleState: 'archived',
            },
        });
        hoisted.isSessionInteractionBlocked.mockReturnValue(true);
        hoisted.getSessionStatus.mockReturnValue({
            state: 'disconnected',
            isConnected: false,
            statusText: 'offline',
            shouldShowStatus: true,
            statusColor: '#999',
            statusDotColor: '#999',
        });

        const controlState = getSessionControlState(session, { sessionId: session.id });

        expect(controlState).toEqual({
            interactionBlocked: true,
            isArchivedSession: true,
            isConnected: false,
            isDisconnected: true,
            isInactiveArchivedSession: true,
            status: {
                state: 'disconnected',
                isConnected: false,
                statusText: 'offline',
                shouldShowStatus: true,
                statusColor: '#999',
                statusDotColor: '#999',
            },
        });
    });
});
