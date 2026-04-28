import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

vi.mock('@/sync/sync', () => ({
    sync: {
        sendMessage: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('@/-session/resolveSendTargetSession', () => ({
    resolveSendTargetSessionId: vi.fn(async () => 'session-1'),
}));

import { OrbitSessionMessageTransport } from './OrbitSessionMessageTransport';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
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
        presence: 'online',
        ...overrides,
    };
}

describe('OrbitSessionMessageTransport', () => {
    it('resolves the target session id before sending', async () => {
        const resolveTargetSessionId = vi.fn(async () => 'session-2');
        const sendMessage = vi.fn(() => Promise.resolve());
        const session = createSession();

        const transport = new OrbitSessionMessageTransport({
            resolveTargetSessionId,
            sendMessage,
        });

        const targetSessionId = await transport.send(session, {
            content: 'hello',
            displayText: 'hello (display)',
            source: 'chat',
        });

        expect(targetSessionId).toBe('session-2');
        expect(resolveTargetSessionId).toHaveBeenCalledWith(session);
        expect(sendMessage).toHaveBeenCalledWith('session-2', 'hello', {
            displayText: 'hello (display)',
            source: 'chat',
        });
    });
});
