import { describe, expect, it } from 'vitest';

import type { Session } from '@/sync/storageTypes';
import {
    findNativeCliIdentifiersForOrbitSessionId,
    findNativeCliEntryForSession,
    getRouteIdentifierForNativeCliEntry,
    getSynthesizedOrbitSessionIdForNativeCliEntry,
    getNativeCliSessionTarget,
    isExplicitNativeCliIdentifier,
    shouldAutoResolveNativeCliSession,
} from './nativeCliSessionResolver';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: false,
        activeAt: 0,
        metadata: {
            path: '/Users/wwq/Desktop/claudeapp',
            host: 'wwqdeMac-mini.local',
            machineId: 'machine-1',
            codexThreadId: 'thread-123',
            projectRoot: '/Users/wwq/Desktop/claudeapp',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 0,
        ...overrides,
    };
}

describe('nativeCliSessionResolver', () => {
    it('returns native session target for codex-backed session', () => {
        const session = createSession();

        expect(getNativeCliSessionTarget(session)).toEqual({
            machineId: 'machine-1',
            tool: 'codex',
            backendId: 'thread-123',
            workingDirectory: '/Users/wwq/Desktop/claudeapp',
            projectRoot: '/Users/wwq/Desktop/claudeapp',
        });
    });

    it('falls back to imported native history metadata when direct backend ids are missing', () => {
        const session = createSession({
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                projectRoot: '/Users/wwq/Desktop/claudeapp',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-imported-1',
                nativeHistoryImportedAt: 123,
            },
        });

        expect(getNativeCliSessionTarget(session)).toEqual({
            machineId: 'machine-1',
            tool: 'codex',
            backendId: 'thread-imported-1',
            workingDirectory: '/Users/wwq/Desktop/claudeapp',
            projectRoot: '/Users/wwq/Desktop/claudeapp',
        });
    });

    it('marks stale native session as auto-resolvable', () => {
    const session = createSession({
        active: false,
        activeAt: Date.now() - 60_000,
        presence: Date.now() - 60_000,
        metadata: {
            path: '/Users/wwq/Desktop/claudeapp',
            host: 'wwqdeMac-mini.local',
            machineId: 'machine-1',
            codexThreadId: 'thread-123',
            projectRoot: '/Users/wwq/Desktop/claudeapp',
            lifecycleState: 'idle',
        },
    });

    expect(shouldAutoResolveNativeCliSession(session)).toBe(true);
    });

    it('does not auto-resolve archived sessions', () => {
        const session = createSession({
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                codexThreadId: 'thread-123',
                lifecycleState: 'archived',
            },
        });

        expect(shouldAutoResolveNativeCliSession(session)).toBe(false);
    });

    it('always auto-resolves native live mirror sessions', () => {
        const session = createSession({
            active: true,
            activeAt: Date.now(),
            presence: 'online',
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                codexThreadId: 'thread-123',
                lifecycleState: 'running',
                sessionRole: 'native-live-mirror',
            },
        });

        expect(shouldAutoResolveNativeCliSession(session)).toBe(true);
    });

    it('always auto-resolves imported native-history wrapper sessions even if they look online', () => {
        const session = createSession({
            active: true,
            activeAt: Date.now(),
            presence: 'online',
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-123',
                lifecycleState: 'running',
            },
        });

        expect(shouldAutoResolveNativeCliSession(session)).toBe(true);
    });

    it('auto-resolves running native sessions when their live presence is stale', () => {
        const staleAt = Date.now() - 5 * 60_000;
        const session = createSession({
            active: false,
            activeAt: staleAt,
            presence: staleAt,
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                codexThreadId: 'thread-123',
                lifecycleState: 'running',
            },
        });

        expect(shouldAutoResolveNativeCliSession(session)).toBe(true);
    });

    it('does not auto-resolve a freshly resumed daemon native session during the warmup grace period', () => {
        const session = createSession({
            updatedAt: Date.now(),
            active: false,
            activeAt: Date.now() - 5 * 60_000,
            presence: Date.now() - 5 * 60_000,
            metadata: {
                path: '/Users/wwq/Desktop/claudeapp',
                host: 'wwqdeMac-mini.local',
                machineId: 'machine-1',
                claudeSessionId: 'claude-session-123',
                lifecycleState: 'running',
                startedBy: 'daemon',
                startedFromDaemon: true,
            },
        });

        expect(shouldAutoResolveNativeCliSession(session)).toBe(false);
    });

    it('finds the freshest matching entry for the same backend', () => {
        const session = createSession();

        const match = findNativeCliEntryForSession(session, [
            {
                id: 'codex:old',
                tool: 'codex',
                backendId: 'thread-123',
                machineId: 'machine-1',
                workingDirectory: '/Users/wwq/Desktop/other',
                title: 'Older',
                summary: null,
                updatedAt: 100,
            },
            {
                id: 'codex:new',
                tool: 'codex',
                backendId: 'thread-123',
                machineId: 'machine-1',
                workingDirectory: '/Users/wwq/Desktop/claudeapp',
                title: 'Current',
                summary: null,
                updatedAt: 200,
            },
        ]);

        expect(match?.id).toBe('codex:new');
    });

    it('detects explicit native CLI identifiers', () => {
        expect(isExplicitNativeCliIdentifier('codex:thread-123')).toBe(true);
        expect(isExplicitNativeCliIdentifier('native-session:claude:session-123')).toBe(true);
        expect(isExplicitNativeCliIdentifier('ec65a9a4-f645-42ec-85da-c8c3bf579086')).toBe(false);
    });

    it('routes synthesized native history rows back to their Orbit session id', () => {
        expect(getRouteIdentifierForNativeCliEntry({
            id: 'codex:session:orbit-session-123',
            tool: 'codex',
            backendId: 'thread-123',
        })).toBe('codex:session:orbit-session-123');

        expect(getRouteIdentifierForNativeCliEntry({
            id: 'codex:thread-123',
            tool: 'codex',
            backendId: 'thread-123',
        })).toBe('codex:thread-123');
    });

    it('finds native identifiers that synthesize back to an Orbit session id', () => {
        expect(findNativeCliIdentifiersForOrbitSessionId('orbit-session-123', {
            'machine-1': [
                {
                    id: 'codex:session:orbit-session-123',
                    tool: 'codex',
                    backendId: 'thread-123',
                    machineId: 'machine-1',
                    workingDirectory: '/Users/wwq/Desktop/claudeapp',
                    title: 'Orbit session',
                    summary: null,
                    updatedAt: 100,
                },
                {
                    id: 'codex:thread-456',
                    tool: 'codex',
                    backendId: 'thread-456',
                    machineId: 'machine-1',
                    workingDirectory: '/Users/wwq/Desktop/claudeapp',
                    title: 'Other session',
                    summary: null,
                    updatedAt: 90,
                },
            ],
            'machine-2': [
                {
                    id: 'claude:session:orbit-session-123',
                    tool: 'claude',
                    backendId: 'claude-session-1',
                    machineId: 'machine-2',
                    workingDirectory: '/Users/wwq',
                    title: 'Claude session',
                    summary: null,
                    updatedAt: 80,
                },
            ],
        })).toEqual([
            'codex:session:orbit-session-123',
            'claude:session:orbit-session-123',
        ]);
    });

    it('extracts synthesized Orbit session ids from native rows', () => {
        expect(getSynthesizedOrbitSessionIdForNativeCliEntry({
            id: 'claude:session:orbit-session-456',
        })).toBe('orbit-session-456');

        expect(getSynthesizedOrbitSessionIdForNativeCliEntry({
            id: 'claude:session-123',
        })).toBe(null);
    });
});
