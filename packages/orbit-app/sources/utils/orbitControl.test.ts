import { describe, expect, it } from 'vitest';
import type { Session } from '@/sync/storageTypes';
import type { SessionStatus } from './sessionUtils';
import { getOrbitControlTiles } from './orbitControl';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            path: '/Users/test/project',
            host: 'mac-mini',
            flavor: 'claude',
            sandbox: null,
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

function createStatus(overrides: Partial<SessionStatus> = {}): SessionStatus {
    return {
        state: 'disconnected',
        isConnected: false,
        statusText: 'Offline',
        shouldShowStatus: true,
        statusColor: '#999',
        statusDotColor: '#999',
        ...overrides,
    };
}

describe('getOrbitControlTiles', () => {
    it('summarizes a live sandboxed session with usage data', () => {
        const session = createSession({
            presence: 'online',
            latestUsage: {
                inputTokens: 1200,
                outputTokens: 600,
                cacheCreation: 0,
                cacheRead: 400,
                contextSize: 8192,
                timestamp: 1,
            },
            metadata: {
                path: '/Users/test/project',
                host: 'mac-mini',
                flavor: 'claude',
                sandbox: {
                    enabled: true,
                    sessionIsolation: 'workspace',
                },
            },
        });

        const tiles = getOrbitControlTiles(session, createStatus({
            state: 'thinking',
            isConnected: true,
            statusText: 'Working',
        }));

        expect(tiles).toEqual([
            expect.objectContaining({ key: 'link', value: 'Live', detail: 'Agent is actively working' }),
            expect.objectContaining({ key: 'safety', value: 'Sandboxed', detail: 'Workspace guardrails are active' }),
            expect.objectContaining({ key: 'resume', value: 'Attached', detail: 'This session is already live' }),
            expect.objectContaining({ key: 'usage', value: '2.2k', detail: 'ctx 8.2k' }),
        ]);
    });

    it('summarizes a standby resumable session in yolo mode', () => {
        const session = createSession({
            metadata: {
                path: '/Users/test/project',
                host: 'mac-mini',
                flavor: 'codex',
                codexThreadId: 'thread-123',
                sandbox: null,
                dangerouslySkipPermissions: true,
            },
        });

        const tiles = getOrbitControlTiles(session, createStatus());

        expect(tiles).toEqual([
            expect.objectContaining({ key: 'link', value: 'Standby', detail: 'Resume command is ready' }),
            expect.objectContaining({ key: 'safety', value: 'YOLO', detail: 'Direct execution is enabled' }),
            expect.objectContaining({ key: 'resume', value: 'Ready', detail: '1-tap command handoff' }),
            expect.objectContaining({ key: 'usage', value: 'No data', detail: 'No token snapshot yet' }),
        ]);
    });

    it('surfaces permission attention before other link states', () => {
        const session = createSession({
            presence: 'online',
        });

        const tiles = getOrbitControlTiles(session, createStatus({
            state: 'permission_required',
            isConnected: true,
            statusText: 'Permission required',
        }));

        expect(tiles[0]).toEqual(expect.objectContaining({
            key: 'link',
            value: 'Attention',
            detail: 'Approval is blocking progress',
        }));
        expect(tiles[1]).toEqual(expect.objectContaining({
            key: 'safety',
            value: 'Review',
            detail: 'Approvals stay on-device',
        }));
    });
});
