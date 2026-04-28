import { describe, expect, it } from 'vitest';

import type { Session } from '@/sync/storageTypes';

import type { SessionControlState } from './sessionControlState';
import { getSessionRunState } from './sessionRunState';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
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
        presence: 'online',
        ...overrides,
    };
}

function createControlState(
    overrides: Omit<Partial<SessionControlState>, 'status'> & {
        status?: Partial<SessionControlState['status']>;
    } = {},
): SessionControlState {
    const { status: statusOverrides, ...controlOverrides } = overrides;
    const status: SessionControlState['status'] = {
        state: 'waiting',
        isConnected: true,
        statusText: 'online',
        shouldShowStatus: false,
        statusColor: '#34C759',
        statusDotColor: '#34C759',
        ...statusOverrides,
    };

    return {
        interactionBlocked: false,
        isArchivedSession: false,
        isConnected: status.isConnected,
        isDisconnected: !status.isConnected,
        isInactiveArchivedSession: false,
        status,
        ...controlOverrides,
    };
}

describe('getSessionRunState', () => {
    it('keeps abort control available for a running session while the monitor reconnects', () => {
        const state = getSessionRunState({
            session: createSession({ thinking: true }),
            sessionControlState: createControlState({
                isConnected: false,
                isDisconnected: true,
                status: {
                    state: 'disconnected',
                    isConnected: false,
                    statusText: 'last seen just now',
                    shouldShowStatus: true,
                    statusColor: '#999',
                    statusDotColor: '#999',
                },
            }),
            connectionPending: true,
        });

        expect(state.kind).toBe('reconnecting');
        expect(state.isRunning).toBe(true);
        expect(state.canAbort).toBe(true);
        expect(state.controlAvailable).toBe(true);
        expect(state.canSendMessages).toBe(false);
        expect(state.shouldShowInlineStatus).toBe(true);
    });

    it('reports a deterministic running state for active agent work', () => {
        const state = getSessionRunState({
            session: createSession({ thinking: true }),
            sessionControlState: createControlState(),
            connectionPending: false,
        });

        expect(state.kind).toBe('running');
        expect(state.isRunning).toBe(true);
        expect(state.canAbort).toBe(true);
        expect(state.canSendMessages).toBe(false);
        expect(state.shouldShowInlineStatus).toBe(true);
    });

    it('prioritizes permission requests over generic running text', () => {
        const state = getSessionRunState({
            session: createSession({ thinking: true }),
            sessionControlState: createControlState({
                status: {
                    state: 'permission_required',
                    statusText: 'permission required',
                    shouldShowStatus: true,
                    statusColor: '#FF9500',
                    statusDotColor: '#FF9500',
                    isPulsing: true,
                },
            }),
            connectionPending: false,
        });

        expect(state.kind).toBe('permission_required');
        expect(state.isRunning).toBe(true);
        expect(state.canAbort).toBe(true);
        expect(state.canSendMessages).toBe(false);
        expect(state.shouldShowInlineStatus).toBe(true);
    });

    it('blocks sending while a non-running session is still connecting', () => {
        const state = getSessionRunState({
            session: createSession({ thinking: false }),
            sessionControlState: createControlState(),
            connectionPending: true,
        });

        expect(state.kind).toBe('connecting');
        expect(state.isRunning).toBe(false);
        expect(state.canAbort).toBe(false);
        expect(state.canSendMessages).toBe(false);
        expect(state.shouldShowInlineStatus).toBe(true);
    });

    it('does not show controls for inactive archived sessions', () => {
        const state = getSessionRunState({
            session: createSession({
                thinking: true,
                metadata: {
                    machineId: 'machine-1',
                    path: '/Users/test/project',
                    host: 'wwq-mac',
                    flavor: 'codex',
                    lifecycleState: 'archived',
                },
            }),
            sessionControlState: createControlState({
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
            }),
            connectionPending: false,
        });

        expect(state.kind).toBe('archived');
        expect(state.isRunning).toBe(false);
        expect(state.canAbort).toBe(false);
        expect(state.canSendMessages).toBe(false);
        expect(state.shouldShowInlineStatus).toBe(false);
    });
});
