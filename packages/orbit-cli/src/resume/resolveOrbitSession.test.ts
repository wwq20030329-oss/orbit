import { describe, expect, it } from 'vitest';

import {
    resolveOperationalOrbitSession,
    resolveOperationalOrbitSessionFromRecords,
    resolveSessionRecordByPrefix,
} from './resolveOrbitSession';

function makeMetadata(overrides: Record<string, unknown> = {}) {
    return {
        path: '/tmp/project',
        host: 'localhost',
        homeDir: '/tmp',
        orbitHomeDir: '/tmp/.orbit',
        orbitLibDir: '/tmp/orbit',
        orbitToolsDir: '/tmp/orbit/tools',
        ...overrides,
    };
}

describe('resolveSessionRecordByPrefix', () => {
    const sessions = [
        { id: 'cmmij8olq00dp5jcxr3wtbpau' },
        { id: 'cmmhiilo00dv7y7e8wjdr5s9x' },
    ];

    it('resolves an exact match', () => {
        expect(resolveSessionRecordByPrefix(sessions, 'cmmhiilo00dv7y7e8wjdr5s9x')).toEqual({
            id: 'cmmhiilo00dv7y7e8wjdr5s9x',
        });
    });

    it('resolves by unique prefix', () => {
        expect(resolveSessionRecordByPrefix(sessions, 'cmmij8')).toEqual({
            id: 'cmmij8olq00dp5jcxr3wtbpau',
        });
    });

    it('rejects unknown prefixes', () => {
        expect(() => resolveSessionRecordByPrefix(sessions, 'missing')).toThrow(
            'No Orbit session found matching "missing"',
        );
    });

    it('rejects ambiguous prefixes', () => {
        expect(() => resolveSessionRecordByPrefix(sessions, 'cmm')).toThrow(
            'Ambiguous Orbit session "cmm" matches 2 sessions. Be more specific.',
        );
    });
});

describe('resolveOperationalOrbitSession', () => {
    it('continues an archived wrapper into the active session with the same backend id', () => {
        const requested = {
            id: 'archived-wrapper',
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: makeMetadata({
                flavor: 'codex',
                nativeHistorySourceTool: 'codex' as const,
                nativeHistorySourceBackendId: 'thread-1',
                lifecycleState: 'archived',
            }),
        };
        const resolved = {
            id: 'live-session',
            updatedAt: 20,
            active: true,
            activeAt: 20,
            metadata: makeMetadata({
                flavor: 'codex',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            }),
        };

        const result = resolveOperationalOrbitSession({
            requested,
            sessions: [requested, resolved],
        });

        expect(result.requested.id).toBe('archived-wrapper');
        expect(result.resolved.id).toBe('live-session');
        expect(result.continued).toBe(true);
    });

    it('prefers a direct active session over an imported wrapper for the same backend', () => {
        const requested = {
            id: 'history-wrapper',
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: makeMetadata({
                flavor: 'claude',
                nativeHistorySourceTool: 'claude' as const,
                nativeHistorySourceBackendId: 'claude-1',
                lifecycleState: 'archived',
            }),
        };
        const importedWrapper = {
            id: 'imported-wrapper',
            updatedAt: 20,
            active: true,
            activeAt: 20,
            metadata: makeMetadata({
                flavor: 'claude',
                nativeHistorySourceTool: 'claude' as const,
                nativeHistorySourceBackendId: 'claude-1',
                lifecycleState: 'running',
            }),
        };
        const directSession = {
            id: 'direct-session',
            updatedAt: 15,
            active: true,
            activeAt: 15,
            metadata: makeMetadata({
                flavor: 'claude',
                claudeSessionId: 'claude-1',
                lifecycleState: 'running',
            }),
        };

        const result = resolveOperationalOrbitSession({
            requested,
            sessions: [requested, importedWrapper, directSession],
        });

        expect(result.resolved.id).toBe('direct-session');
        expect(result.continued).toBe(true);
    });

    it('prefers the newest active continuation when multiple direct sessions match', () => {
        const requested = {
            id: 'history-wrapper',
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: makeMetadata({
                flavor: 'codex',
                nativeHistorySourceTool: 'codex' as const,
                nativeHistorySourceBackendId: 'thread-1',
                lifecycleState: 'archived',
            }),
        };
        const olderDirectSession = {
            id: 'direct-session-older',
            updatedAt: 100,
            active: true,
            activeAt: 100,
            metadata: makeMetadata({
                flavor: 'codex',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            }),
        };
        const newerDirectSession = {
            id: 'direct-session-newer',
            updatedAt: 200,
            active: true,
            activeAt: 200,
            metadata: makeMetadata({
                flavor: 'codex',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            }),
        };

        const result = resolveOperationalOrbitSession({
            requested,
            sessions: [requested, olderDirectSession, newerDirectSession],
        });

        expect(result.resolved.id).toBe('direct-session-newer');
        expect(result.continued).toBe(true);
    });

    it('tolerates unrelated broken records while resolving a continuation', () => {
        const requested = {
            id: 'archived-wrapper',
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: 'encrypted-requested',
            dataEncryptionKey: null,
        };
        const brokenCandidate = {
            id: 'broken-candidate',
            updatedAt: 20,
            active: true,
            activeAt: 20,
            metadata: 'encrypted-broken',
            dataEncryptionKey: null,
        };
        const liveSession = {
            id: 'live-session',
            updatedAt: 30,
            active: true,
            activeAt: 30,
            metadata: 'encrypted-live',
            dataEncryptionKey: null,
        };

        const result = resolveOperationalOrbitSessionFromRecords({
            sessionId: 'archived-wrapper',
            sessions: [requested, brokenCandidate, liveSession],
            decryptMetadata(session) {
                if (session.id === 'broken-candidate') {
                    throw new Error('corrupt metadata');
                }
                if (session.id === 'archived-wrapper') {
                    return makeMetadata({
                        flavor: 'codex',
                        nativeHistorySourceTool: 'codex' as const,
                        nativeHistorySourceBackendId: 'thread-1',
                        lifecycleState: 'archived',
                    });
                }
                return makeMetadata({
                    flavor: 'codex',
                    codexThreadId: 'thread-1',
                    lifecycleState: 'running',
                });
            },
        });

        expect(result.requested.id).toBe('archived-wrapper');
        expect(result.resolved.id).toBe('live-session');
        expect(result.continued).toBe(true);
    });

    it('still fails when the requested session record cannot be decrypted', () => {
        const requested = {
            id: 'archived-wrapper',
            updatedAt: 10,
            active: false,
            activeAt: 10,
            metadata: 'encrypted-requested',
            dataEncryptionKey: null,
        };
        const liveSession = {
            id: 'live-session',
            updatedAt: 30,
            active: true,
            activeAt: 30,
            metadata: 'encrypted-live',
            dataEncryptionKey: null,
        };

        expect(() => resolveOperationalOrbitSessionFromRecords({
            sessionId: 'archived-wrapper',
            sessions: [requested, liveSession],
            decryptMetadata(session) {
                if (session.id === 'archived-wrapper') {
                    throw new Error('requested record is unreadable');
                }
                return makeMetadata({
                    flavor: 'codex',
                    codexThreadId: 'thread-1',
                    lifecycleState: 'running',
                });
            },
        })).toThrow('requested record is unreadable');
    });
});
