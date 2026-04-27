import { describe, expect, it } from 'vitest';

import type { DecryptedSession } from './api';
import { resolveOperationalSession } from './sessionResolution';

function makeSession(overrides: Partial<DecryptedSession> = {}): DecryptedSession {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {},
        agentState: null,
        dataEncryptionKey: null,
        encryption: {
            key: new Uint8Array(32),
            variant: 'legacy',
        },
        ...overrides,
    };
}

describe('resolveOperationalSession', () => {
    it('keeps an already active session as-is', () => {
        const requested = makeSession({
            metadata: { codexThreadId: 'thread-1', lifecycleState: 'running' },
        });

        const result = resolveOperationalSession({
            requested,
            sessions: [requested],
        });

        expect(result.resolved.id).toBe(requested.id);
        expect(result.continued).toBe(false);
    });

    it('switches an archived session to a newer active continuation with the same backend id', () => {
        const requested = makeSession({
            id: 'archived',
            active: false,
            updatedAt: 10,
            metadata: { claudeSessionId: 'claude-1', lifecycleState: 'archived' },
        });
        const continuation = makeSession({
            id: 'continued',
            active: true,
            updatedAt: 20,
            metadata: { claudeSessionId: 'claude-1', lifecycleState: 'running' },
        });

        const result = resolveOperationalSession({
            requested,
            sessions: [requested, continuation],
        });

        expect(result.resolved.id).toBe('continued');
        expect(result.continued).toBe(true);
    });

    it('matches imported native history sessions to active continuations', () => {
        const requested = makeSession({
            id: 'history-session',
            active: false,
            metadata: {
                flavor: 'codex',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-9',
                lifecycleState: 'archived',
            },
        });
        const continuation = makeSession({
            id: 'active-session',
            active: true,
            updatedAt: 99,
            metadata: {
                flavor: 'codex',
                codexThreadId: 'thread-9',
                lifecycleState: 'running',
            },
        });

        const result = resolveOperationalSession({
            requested,
            sessions: [requested, continuation],
        });

        expect(result.resolved.id).toBe('active-session');
        expect(result.continued).toBe(true);
    });

    it('prefers a direct active continuation over a newer imported wrapper for the same backend', () => {
        const requested = makeSession({
            id: 'history-session',
            active: false,
            metadata: {
                flavor: 'codex',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-9',
                lifecycleState: 'archived',
            },
        });
        const importedWrapper = makeSession({
            id: 'imported-wrapper',
            active: true,
            updatedAt: 200,
            activeAt: 200,
            metadata: {
                flavor: 'codex',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-9',
                lifecycleState: 'running',
            },
        });
        const directContinuation = makeSession({
            id: 'direct-session',
            active: true,
            updatedAt: 150,
            activeAt: 150,
            metadata: {
                flavor: 'codex',
                codexThreadId: 'thread-9',
                lifecycleState: 'running',
            },
        });

        const result = resolveOperationalSession({
            requested,
            sessions: [requested, importedWrapper, directContinuation],
        });

        expect(result.resolved.id).toBe('direct-session');
        expect(result.continued).toBe(true);
    });

    it('falls back to the requested session when no continuation exists', () => {
        const requested = makeSession({
            id: 'archived',
            active: false,
            metadata: { geminiSessionId: 'gemini-1', lifecycleState: 'archived' },
        });

        const result = resolveOperationalSession({
            requested,
            sessions: [requested],
        });

        expect(result.resolved.id).toBe('archived');
        expect(result.continued).toBe(false);
    });
});
