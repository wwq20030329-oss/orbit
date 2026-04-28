import { describe, expect, it } from 'vitest';

import {
    shouldRefreshSessionsOnVisible,
    shouldRefreshVisibleSessionMessages,
    VISIBLE_SESSION_MESSAGES_REFRESH_COOLDOWN_MS,
    VISIBLE_SESSION_STATE_REFRESH_COOLDOWN_MS,
} from './sessionVisibleRefresh';
import type { Session } from './storageTypes';
import type { SessionControlState } from '@/utils/sessionControlState';

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'machine',
            lifecycleState: 'running',
            claudeSessionId: 'claude-session-1',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 0,
        ...overrides,
    };
}

function makeControlState(overrides: Partial<SessionControlState> = {}): SessionControlState {
    return {
        interactionBlocked: false,
        isArchivedSession: false,
        isConnected: false,
        isDisconnected: true,
        isInactiveArchivedSession: false,
        status: {
            state: 'disconnected',
            isConnected: false,
            statusText: 'offline',
            shouldShowStatus: true,
            statusColor: '#999',
            statusDotColor: '#999',
        },
        ...overrides,
    };
}

describe('shouldRefreshSessionsOnVisible', () => {
    it('refreshes running native CLI sessions that currently look disconnected', () => {
        expect(shouldRefreshSessionsOnVisible(
            makeSession(),
            makeControlState(),
        )).toBe(true);
    });

    it('does not refresh already-connected sessions', () => {
        expect(shouldRefreshSessionsOnVisible(
            makeSession(),
            makeControlState({
                isConnected: true,
                isDisconnected: false,
                status: {
                    state: 'waiting',
                    isConnected: true,
                    statusText: 'online',
                    shouldShowStatus: false,
                    statusColor: '#0f0',
                    statusDotColor: '#0f0',
                },
            }),
        )).toBe(false);
    });

    it('does not refresh non-native or archived sessions', () => {
        expect(shouldRefreshSessionsOnVisible(
            makeSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'machine',
                    lifecycleState: 'running',
                },
            }),
            makeControlState(),
        )).toBe(false);

        expect(shouldRefreshSessionsOnVisible(
            makeSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'machine',
                    lifecycleState: 'archived',
                    claudeSessionId: 'claude-session-1',
                },
            }),
            makeControlState(),
        )).toBe(false);
    });

    it('rate limits repeated visibility refreshes for the same disconnected session', () => {
        const now = 1_000_000;

        expect(shouldRefreshSessionsOnVisible(
            makeSession(),
            makeControlState(),
            {
                lastRefreshedAt: now - (VISIBLE_SESSION_STATE_REFRESH_COOLDOWN_MS - 1),
                now,
            },
        )).toBe(false);

        expect(shouldRefreshSessionsOnVisible(
            makeSession(),
            makeControlState(),
            {
                lastRefreshedAt: now - VISIBLE_SESSION_STATE_REFRESH_COOLDOWN_MS,
                now,
            },
        )).toBe(true);
    });
});

describe('shouldRefreshVisibleSessionMessages', () => {
    it('refreshes when no messages have loaded yet', () => {
        expect(shouldRefreshVisibleSessionMessages({
            loadedCount: 0,
            lastRefreshedAt: Date.now(),
        })).toBe(true);
    });

    it('rate limits repeated refreshes for already-loaded messages', () => {
        const now = 2_000_000;

        expect(shouldRefreshVisibleSessionMessages({
            loadedCount: 20,
            lastRefreshedAt: now - (VISIBLE_SESSION_MESSAGES_REFRESH_COOLDOWN_MS - 1),
            now,
        })).toBe(false);

        expect(shouldRefreshVisibleSessionMessages({
            loadedCount: 20,
            lastRefreshedAt: now - VISIBLE_SESSION_MESSAGES_REFRESH_COOLDOWN_MS,
            now,
        })).toBe(true);
    });
});
