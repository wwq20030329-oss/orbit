import { describe, expect, it, vi } from 'vitest';

import type { PersistedNativeCliResumeRequest } from '@/sync/persistence';
import type { Machine, Session } from '@/sync/storageTypes';

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import { getSessionResumeAvailability, resolveSessionResumeTarget } from './sessionResume';

function createSession(
    id: string,
    overrides: Partial<Session> = {},
): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            codexThreadId: 'thread-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
            flavor: 'codex',
            lifecycleState: 'idle',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

function createMachine(
    id: string,
    overrides: Partial<Machine> = {},
): Machine {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: Date.now(),
        metadata: {
            host: 'wwq-mac',
            platform: 'darwin',
            orbitCliVersion: '1.0.0',
            orbitHomeDir: '/Users/test/.orbit',
            homeDir: '/Users/test',
            resumeSupport: {
                rpcAvailable: true,
                requiresSameMachine: true,
                requiresOrbitAgentAuth: false,
                orbitAgentAuthenticated: true,
                detectedAt: Date.now(),
            },
            ...overrides.metadata,
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
        ...overrides,
    };
}

function createResumeRequest(
    overrides: Partial<{
        machineId: string;
        tool: 'claude' | 'codex' | 'gemini';
        backendId: string;
        workingDirectory: string;
        title: string;
        summary: string | null;
        updatedAt: number;
    }> = {},
): PersistedNativeCliResumeRequest {
    return {
        machineId: 'machine-1',
        tool: 'codex',
        backendId: 'thread-1',
        workingDirectory: '/Users/test/project',
        title: 'project',
        summary: null,
        updatedAt: 100,
        ...overrides,
    };
}

describe('resolveSessionResumeTarget', () => {
    it('keeps regular sessions on orbit resume when metadata is intact', () => {
        const session = createSession('session-1');

        expect(resolveSessionResumeTarget(session)).toEqual({
            type: 'orbit-session',
            machineId: 'machine-1',
            sessionId: 'session-1',
        });
    });

    it('falls back to remembered native resume requests for blocked history sessions', () => {
        const session = createSession('session-1', {
            metadata: null,
        });
        const request = createResumeRequest();

        expect(resolveSessionResumeTarget(session, {
            interactionBlocked: true,
            nativeResumeRequest: request,
        })).toEqual({
            type: 'native-cli-history',
            machineId: 'machine-1',
            sessionId: 'session-1',
            request,
        });
    });
});

describe('getSessionResumeAvailability', () => {
    it('allows resume when a remembered native request provides the missing machine metadata', () => {
        const session = createSession('session-1', {
            metadata: null,
        });
        const request = createResumeRequest();
        const machine = createMachine('machine-1');

        const availability = getSessionResumeAvailability(session, machine, false, {
            interactionBlocked: true,
            nativeResumeRequest: request,
        });

        expect(availability.canResume).toBe(true);
        expect(availability.canShowResume).toBe(true);
    });

    it('does not require orbit-agent auth for native history resume targets', () => {
        const session = createSession('session-1', {
            metadata: null,
        });
        const request = createResumeRequest();
        const machine = createMachine('machine-1', {
            metadata: {
                host: 'wwq-mac',
                platform: 'darwin',
                orbitCliVersion: '1.0.0',
                orbitHomeDir: '/Users/test/.orbit',
                homeDir: '/Users/test',
                resumeSupport: {
                    rpcAvailable: false,
                    requiresSameMachine: true,
                    requiresOrbitAgentAuth: true,
                    orbitAgentAuthenticated: false,
                    detectedAt: Date.now(),
                },
            },
        });

        const availability = getSessionResumeAvailability(session, machine, false, {
            interactionBlocked: true,
            nativeResumeRequest: request,
        });

        expect(availability.canResume).toBe(true);
        expect(availability.canShowResume).toBe(true);
    });

    it('still reports missing machine metadata when no resume fallback exists', () => {
        const session = createSession('session-1', {
            metadata: null,
        });

        const availability = getSessionResumeAvailability(session, null, false);

        expect(availability.canResume).toBe(false);
        expect(availability.canShowResume).toBe(true);
        expect(availability.message).toBe('sessionInfo.resumeSessionMissingMachine');
    });
});
