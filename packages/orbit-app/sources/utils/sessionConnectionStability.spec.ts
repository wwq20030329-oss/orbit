import { describe, expect, it } from 'vitest';
import type { Session } from '@/sync/storageTypes';
import {
    clearSessionConnectionSnapshots,
    MOBILE_CONNECTION_STABILITY_GRACE_MS,
    rememberStableSessionConnection,
    shouldHoldConnectedUi,
} from './sessionConnectionStability';

function createSession(id: string, metadata?: Partial<Session['metadata']>): Session {
    return {
        id,
        seq: 1,
        active: true,
        createdAt: 1,
        updatedAt: 1,
        activeAt: 1,
        metadata: metadata as any,
        metadataVersion: 1,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        latestUsage: null,
        agentState: null,
        todos: undefined,
        draft: null,
    } as unknown as Session;
}

describe('shouldHoldConnectedUi', () => {
    it('holds the connected UI during the short grace window', () => {
        clearSessionConnectionSnapshots();
        const session = createSession('session-1');
        rememberStableSessionConnection({
            session,
            sessionId: session.id,
            rawDisconnected: false,
            now: 10_000,
        });

        expect(shouldHoldConnectedUi({
            session,
            sessionId: session.id,
            rawDisconnected: true,
            lifecycleState: 'running',
            now: 10_000 + MOBILE_CONNECTION_STABILITY_GRACE_MS - 1,
        })).toBe(true);
    });

    it('stops holding once the grace window expires', () => {
        clearSessionConnectionSnapshots();
        const session = createSession('session-1');
        rememberStableSessionConnection({
            session,
            sessionId: session.id,
            rawDisconnected: false,
            now: 10_000,
        });

        expect(shouldHoldConnectedUi({
            session,
            sessionId: session.id,
            rawDisconnected: true,
            lifecycleState: 'running',
            now: 10_000 + MOBILE_CONNECTION_STABILITY_GRACE_MS,
        })).toBe(false);
    });

    it('does not hold when native connection is actively pending', () => {
        clearSessionConnectionSnapshots();
        const session = createSession('session-1');
        rememberStableSessionConnection({
            session,
            sessionId: session.id,
            rawDisconnected: false,
            now: 10_000,
        });

        expect(shouldHoldConnectedUi({
            session,
            sessionId: session.id,
            rawDisconnected: true,
            nativeConnectionPending: true,
            lifecycleState: 'running',
            now: 10_100,
        })).toBe(false);
    });

    it('reuses recent connection memory across wrapper and direct sessions for the same native thread', () => {
        clearSessionConnectionSnapshots();
        const wrapperSession = createSession('wrapper', {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
        });
        const directSession = createSession('direct', {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
        });

        rememberStableSessionConnection({
            session: wrapperSession,
            sessionId: wrapperSession.id,
            rawDisconnected: false,
            now: 10_000,
        });

        expect(shouldHoldConnectedUi({
            session: directSession,
            sessionId: directSession.id,
            rawDisconnected: true,
            lifecycleState: 'running',
            now: 10_100,
        })).toBe(true);
    });
});
