import { describe, expect, it } from 'vitest';
import type { Session } from '@/sync/storageTypes';
import type { Message } from '@/sync/typesMessage';
import {
    clearSessionMessageSnapshots,
    getStableSessionMessages,
    MOBILE_MESSAGE_STABILITY_GRACE_MS,
    rememberStableSessionMessages,
} from './sessionMessageStability';

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
        version: 1,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        lastActiveAt: null,
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        prompt: null,
        latestUsage: null,
        agentState: null,
        todos: undefined,
        actions: [],
        needNaming: false,
    } as unknown as Session;
}

function createMessage(id: string): Message {
    return {
        id,
        kind: 'user-text',
        localId: null,
        createdAt: 1,
        text: id,
    } as unknown as Message;
}

describe('sessionMessageStability', () => {
    it('prefers current messages when available', () => {
        const session = createSession('session-1');
        const message = createMessage('message-1');

        expect(getStableSessionMessages({
            session,
            sessionId: session.id,
            messages: [message],
            isLoaded: false,
            now: 10_000,
        })).toEqual({
            messages: [message],
            isLoaded: false,
        });
    });

    it('reuses a recent snapshot for the same native cli thread', () => {
        clearSessionMessageSnapshots();
        const previousSession = createSession('wrapper', {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
        });
        const currentSession = createSession('direct', {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
        });
        const message = createMessage('message-1');

        rememberStableSessionMessages({
            session: previousSession,
            sessionId: previousSession.id,
            messages: [message],
            isLoaded: true,
            now: 10_000,
        });

        expect(getStableSessionMessages({
            session: currentSession,
            sessionId: currentSession.id,
            messages: [],
            isLoaded: false,
            now: 10_100,
        })).toEqual({
            messages: [message],
            isLoaded: true,
        });
    });

    it('can reuse a loaded-empty snapshot to avoid reverting to loading', () => {
        clearSessionMessageSnapshots();
        const session = createSession('session-1');

        rememberStableSessionMessages({
            session,
            sessionId: session.id,
            messages: [],
            isLoaded: true,
            now: 10_000,
        });

        expect(getStableSessionMessages({
            session,
            sessionId: session.id,
            messages: [],
            isLoaded: false,
            now: 10_100,
        })).toEqual({
            messages: [],
            isLoaded: true,
        });
    });

    it('drops the snapshot once the grace window expires', () => {
        clearSessionMessageSnapshots();
        const session = createSession('session-1');
        const message = createMessage('message-1');

        rememberStableSessionMessages({
            session,
            sessionId: session.id,
            messages: [message],
            isLoaded: true,
            now: 10_000,
        });

        expect(getStableSessionMessages({
            session,
            sessionId: session.id,
            messages: [],
            isLoaded: false,
            now: 10_000 + MOBILE_MESSAGE_STABILITY_GRACE_MS,
        })).toEqual({
            messages: [],
            isLoaded: false,
        });
    });
});
