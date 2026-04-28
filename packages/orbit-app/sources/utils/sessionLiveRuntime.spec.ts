import { describe, expect, it } from 'vitest';

import type { Session } from '@/sync/storageTypes';

import {
    LIVE_RUNTIME_SOCKET_DISCONNECT_GRACE_MS,
    applyLiveRuntimeFrameToSessions,
    connectSessionsToLiveRuntime,
    detachAllConnectedLiveRuntimeSessions,
    detachSessionsFromLiveRuntime,
    shouldDeferLiveRuntimeDetachDuringSocketRecovery,
    isSessionMatchingLiveRuntimeTarget,
    resolveSessionLiveRuntimeTarget,
    shouldKeepLiveRuntimeStateDuringSocketRecovery,
} from './sessionLiveRuntime';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 200,
        active: false,
        activeAt: 150,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
            lifecycleState: 'running',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 150,
        ...overrides,
    };
}

describe('resolveSessionLiveRuntimeTarget', () => {
    it('keeps a non-zero disconnect grace for transient socket recovery', () => {
        expect(LIVE_RUNTIME_SOCKET_DISCONNECT_GRACE_MS).toBeGreaterThan(0);
        expect(shouldKeepLiveRuntimeStateDuringSocketRecovery('disconnected')).toBe(true);
        expect(shouldKeepLiveRuntimeStateDuringSocketRecovery('connecting')).toBe(true);
        expect(shouldKeepLiveRuntimeStateDuringSocketRecovery('error')).toBe(true);
        expect(shouldKeepLiveRuntimeStateDuringSocketRecovery('connected')).toBe(false);
    });

    it('defers transient detach reasons only while the socket is still recovering', () => {
        expect(shouldDeferLiveRuntimeDetachDuringSocketRecovery('client-detached', 'disconnected')).toBe(true);
        expect(shouldDeferLiveRuntimeDetachDuringSocketRecovery('error', 'connecting')).toBe(true);
        expect(shouldDeferLiveRuntimeDetachDuringSocketRecovery('runtime-ended', 'disconnected')).toBe(false);
        expect(shouldDeferLiveRuntimeDetachDuringSocketRecovery('client-detached', 'connected')).toBe(false);
    });

    it('resolves orbit runtimes for direct Orbit-backed CLI sessions', () => {
        const target = resolveSessionLiveRuntimeTarget(createSession({
            id: 'orbit-session-1',
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            },
        }));

        expect(target).toEqual({
            source: 'orbit-runtime',
            runtimeId: 'orbit-runtime:orbit-session-1',
            sessionId: 'orbit-session-1',
            machineId: 'machine-1',
        });
    });

    it('resolves native runtimes for imported native history wrappers', () => {
        const target = resolveSessionLiveRuntimeTarget(createSession({
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                nativeHistorySourceTool: 'claude',
                nativeHistorySourceBackendId: 'claude-session-1',
                lifecycleState: 'running',
            },
        }));

        expect(target).toEqual({
            source: 'native-runtime',
            runtimeId: 'native-runtime:claude:claude-session-1',
            sessionId: 'native-session:claude:claude-session-1',
            machineId: 'machine-1',
        });
    });

    it('resolves native runtimes for internal native live mirror sessions', () => {
        const target = resolveSessionLiveRuntimeTarget(createSession({
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                sessionRole: 'native-live-mirror',
                geminiSessionId: 'gemini-session-1',
                lifecycleState: 'running',
            },
        }));

        expect(target).toEqual({
            source: 'native-runtime',
            runtimeId: 'native-runtime:gemini:gemini-session-1',
            sessionId: 'native-session:gemini:gemini-session-1',
            machineId: 'machine-1',
        });
    });

    it('returns null when the session does not have enough runtime metadata', () => {
        expect(resolveSessionLiveRuntimeTarget(createSession({
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                flavor: 'codex',
                lifecycleState: 'running',
            },
        }))).toBeNull();
    });
});

describe('session live runtime state reducers', () => {
    it('matches sessions against resolved runtime targets', () => {
        const session = createSession({
            id: 'orbit-session-1',
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            },
        });

        expect(isSessionMatchingLiveRuntimeTarget(session, {
            runtimeId: 'orbit-runtime:orbit-session-1',
            sessionId: 'orbit-session-1',
            machineId: 'machine-1',
        })).toBe(true);

        expect(isSessionMatchingLiveRuntimeTarget(session, {
            runtimeId: 'native-runtime:codex:thread-1',
            sessionId: 'native-session:codex:thread-1',
            machineId: 'machine-1',
        })).toBe(false);
    });

    it('connects and updates matching sessions only', () => {
        const matchingSession = createSession({
            id: 'orbit-session-1',
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                codexThreadId: 'thread-1',
                lifecycleState: 'running',
            },
        });
        const untouchedSession = createSession({
            id: 'session-2',
            metadata: {
                machineId: 'machine-1',
                path: '/Users/test/project',
                host: 'wwq-mac',
                nativeHistorySourceTool: 'claude',
                nativeHistorySourceBackendId: 'claude-session-1',
                lifecycleState: 'running',
            },
        });

        const connected = connectSessionsToLiveRuntime({
            'orbit-session-1': matchingSession,
            'session-2': untouchedSession,
        }, {
            runtimeId: 'orbit-runtime:orbit-session-1',
            sessionId: 'orbit-session-1',
            machineId: 'machine-1',
        }, 1_000, 1_050);

        expect(connected['orbit-session-1']?.liveRuntime).toEqual({
            runtimeId: 'orbit-runtime:orbit-session-1',
            sessionId: 'orbit-session-1',
            machineId: 'machine-1',
            status: 'connected',
            connectedAt: 1_000,
            lastFrameAt: 1_050,
            lastDetachAt: null,
            detachReason: null,
        });
        expect(connected['session-2']).toBe(untouchedSession);

        const framed = applyLiveRuntimeFrameToSessions(connected, {
            runtimeId: 'orbit-runtime:orbit-session-1',
            sessionId: 'orbit-session-1',
            machineId: 'machine-1',
        }, 1_200);

        expect(framed['orbit-session-1']?.liveRuntime?.lastFrameAt).toBe(1_200);
        expect(framed['orbit-session-1']?.liveRuntime?.status).toBe('connected');
    });

    it('detaches matching sessions and can clear every connected runtime at once', () => {
        const connectedSessions = connectSessionsToLiveRuntime({
            'session-1': createSession({
                metadata: {
                    machineId: 'machine-1',
                    path: '/Users/test/project',
                    host: 'wwq-mac',
                    nativeHistorySourceTool: 'codex',
                    nativeHistorySourceBackendId: 'thread-1',
                    lifecycleState: 'running',
                },
            }),
            'session-2': createSession({
                id: 'session-2',
                metadata: {
                    machineId: 'machine-2',
                    path: '/Users/test/project',
                    host: 'wwq-mac',
                    nativeHistorySourceTool: 'claude',
                    nativeHistorySourceBackendId: 'claude-session-1',
                    lifecycleState: 'running',
                },
            }),
        }, {
            runtimeId: 'native-runtime:codex:thread-1',
            sessionId: 'native-session:codex:thread-1',
            machineId: 'machine-1',
        }, 2_000, 2_100);

        const detached = detachSessionsFromLiveRuntime(connectedSessions, {
            runtimeId: 'native-runtime:codex:thread-1',
            sessionId: 'native-session:codex:thread-1',
            machineId: 'machine-1',
        }, 2_300, 'runtime-ended');

        expect(detached['session-1']?.liveRuntime).toEqual({
            runtimeId: 'native-runtime:codex:thread-1',
            sessionId: 'native-session:codex:thread-1',
            machineId: 'machine-1',
            status: 'detached',
            connectedAt: 2_000,
            lastFrameAt: 2_100,
            lastDetachAt: 2_300,
            detachReason: 'runtime-ended',
        });
        expect(detached['session-2']?.liveRuntime).toBeUndefined();

        const cleared = detachAllConnectedLiveRuntimeSessions(connectedSessions, 2_500, 'client-detached');
        expect(cleared['session-1']?.liveRuntime?.status).toBe('detached');
        expect(cleared['session-1']?.liveRuntime?.lastDetachAt).toBe(2_500);
        expect(cleared['session-2']?.liveRuntime).toBeUndefined();
    });
});
