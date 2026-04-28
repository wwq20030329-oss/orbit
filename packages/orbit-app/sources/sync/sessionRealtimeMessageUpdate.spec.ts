import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiUpdateContainer, ApiUpdateNewMessage } from './apiTypes';
import { handleRealtimeMessageUpdate, type HandleRealtimeMessageUpdateDependencies } from './sessionRealtimeMessageUpdate';
import type { Session } from './storageTypes';
import type { RawRecord } from './typesRaw';

function createSession(id: string): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
    };
}

function createUpdate(overrides: Partial<ApiUpdateContainer & { body: ApiUpdateNewMessage }> = {}): ApiUpdateContainer & { body: ApiUpdateNewMessage } {
    return {
        id: 'update-1',
        seq: 10,
        createdAt: 200,
        body: {
            t: 'new-message',
            sid: 'session-1',
            message: {
                id: 'message-1',
                localId: null,
                seq: 4,
                createdAt: 123,
                updatedAt: 123,
                content: { t: 'encrypted', c: 'encrypted' },
            },
        },
        ...overrides,
    };
}

describe('handleRealtimeMessageUpdate', () => {
    let deps: HandleRealtimeMessageUpdateDependencies;

    beforeEach(() => {
        deps = {
            isSessionVisible: vi.fn(() => true),
            hasLocalMessageHistory: vi.fn(() => true),
            getSessionEncryption: vi.fn(() => ({
                decryptMessage: vi.fn(async () => ({
                    id: 'message-1',
                    localId: null,
                    createdAt: 123,
                    content: {
                        role: 'user',
                        content: { type: 'text', text: 'hello' },
                    } as RawRecord,
                })),
            })),
            getSession: vi.fn(() => createSession('session-1')),
            applySessions: vi.fn(),
            fetchSessions: vi.fn(),
            getLastSeq: vi.fn(() => 3),
            setLastSeq: vi.fn(),
            enqueueMessages: vi.fn(),
            invalidateMessages: vi.fn(),
            isMutableToolCall: vi.fn(() => false),
            invalidateGitStatus: vi.fn(),
            onSessionNotReady: vi.fn(),
            onLifecycleHint: vi.fn(),
        };
    });

    it('refreshes sessions when encryption is not ready', async () => {
        deps.getSessionEncryption = vi.fn(() => null);

        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.onSessionNotReady).toHaveBeenCalledWith('session-1');
        expect(deps.fetchSessions).toHaveBeenCalled();
        expect(deps.applySessions).not.toHaveBeenCalled();
    });

    it('fast-path enqueues consecutive visible messages', async () => {
        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.applySessions).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'session-1',
                updatedAt: 200,
                seq: 10,
            }),
        ]);
        expect(deps.enqueueMessages).toHaveBeenCalledWith(
            'session-1',
            [expect.objectContaining({ id: 'message-1' })],
        );
        expect(deps.setLastSeq).toHaveBeenCalledWith('session-1', 4);
        expect(deps.invalidateMessages).not.toHaveBeenCalled();
    });

    it('invalidates visible message sync on seq gaps', async () => {
        deps.getLastSeq = vi.fn(() => 1);

        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.enqueueMessages).not.toHaveBeenCalled();
        expect(deps.invalidateMessages).toHaveBeenCalledWith('session-1');
    });

    it('shows the first visible realtime message immediately before bootstrapping history', async () => {
        deps.getLastSeq = vi.fn(() => undefined);
        deps.hasLocalMessageHistory = vi.fn(() => false);

        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.enqueueMessages).toHaveBeenCalledWith(
            'session-1',
            [expect.objectContaining({ id: 'message-1' })],
        );
        expect(deps.invalidateMessages).toHaveBeenCalledWith('session-1');
        expect(deps.setLastSeq).not.toHaveBeenCalled();
    });

    it('ignores duplicate or stale realtime messages without refreshing', async () => {
        deps.getLastSeq = vi.fn(() => 4);

        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.enqueueMessages).not.toHaveBeenCalled();
        expect(deps.invalidateMessages).not.toHaveBeenCalled();
    });

    it('refreshes sessions if the session is missing locally', async () => {
        deps.getSession = vi.fn(() => undefined);

        await handleRealtimeMessageUpdate(createUpdate(), deps);

        expect(deps.fetchSessions).toHaveBeenCalled();
    });
});
