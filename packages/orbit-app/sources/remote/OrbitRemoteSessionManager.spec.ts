import { describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

vi.mock('@/sync/apiSocket', () => ({
    apiSocket: {
        onStatusChange: () => () => {},
    },
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        waitForSessionReady: vi.fn(() => Promise.resolve(true)),
        refreshSessionMessages: vi.fn(() => Promise.resolve()),
        onSessionVisible: vi.fn(),
        onSessionHidden: vi.fn(),
        refreshSessionMessagesIfStale: vi.fn(() => Promise.resolve()),
        sendMessage: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: vi.fn(() => ({
            sessions: {},
        })),
    },
}));

vi.mock('@/sync/ops', () => ({
    sessionAbort: vi.fn(() => Promise.resolve()),
    sessionAllow: vi.fn(() => Promise.resolve()),
    sessionDeny: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/-session/resolveSendTargetSession', () => ({
    resolveSendTargetSessionId: vi.fn(async () => 'session-1'),
}));

import { OrbitRemoteSessionManager } from './OrbitRemoteSessionManager';
import { storage } from '@/sync/storage';

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

describe('OrbitRemoteSessionManager', () => {
    it('delegates connection lifecycle to the session-scoped connection object', async () => {
        const connection = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            reconnect: vi.fn(),
        };

        const manager = new OrbitRemoteSessionManager('session-1', {}, {
            connection,
        });

        manager.connect();
        manager.connect();
        expect(connection.connect).toHaveBeenCalledTimes(2);
        manager.disconnect();
        manager.reconnect();

        expect(connection.disconnect).toHaveBeenCalledTimes(1);
        expect(connection.reconnect).toHaveBeenCalledTimes(1);
    });

    it('routes switched sessions before sending and preserves display text', async () => {
        const send = vi.fn(async () => 'session-2');
        const onSessionRouted = vi.fn();

        const manager = new OrbitRemoteSessionManager('session-1', {
            onSessionRouted,
        }, {
            connection: {
                connect: vi.fn(),
                disconnect: vi.fn(),
                reconnect: vi.fn(),
            },
            messageTransport: {
                send,
            },
        });

        const targetSessionId = await manager.sendMessage(createSession(), {
            content: 'hello',
            displayText: 'hello (img)',
            source: 'chat',
        });

        expect(targetSessionId).toBe('session-2');
        expect(onSessionRouted).toHaveBeenCalledWith('session-2');
        expect(send).toHaveBeenCalledWith(createSession(), {
            displayText: 'hello (img)',
            content: 'hello',
            source: 'chat',
        });
    });

    it('can send using the manager session id by reading the current session from storage', async () => {
        const session = createSession();
        vi.mocked(storage.getState).mockReturnValue({
            sessions: {
                'session-1': session,
            },
        } as unknown as ReturnType<typeof storage.getState>);

        const send = vi.fn(async () => 'session-1');
        const manager = new OrbitRemoteSessionManager('session-1', {}, {
            connection: {
                connect: vi.fn(),
                disconnect: vi.fn(),
                reconnect: vi.fn(),
            },
            messageTransport: {
                send,
            },
        });

        const targetSessionId = await manager.sendCurrentSessionMessage({
            content: 'quick reply',
            source: 'option',
        });

        expect(targetSessionId).toBe('session-1');
        expect(send).toHaveBeenCalledWith(session, {
            content: 'quick reply',
            source: 'option',
        });
    });

    it('routes abort and permission decisions through the session-scoped control channel', async () => {
        const abort = vi.fn(() => Promise.resolve());
        const allowPermission = vi.fn(() => Promise.resolve());
        const denyPermission = vi.fn(() => Promise.resolve());
        const manager = new OrbitRemoteSessionManager('session-9', {}, {
            connection: {
                connect: vi.fn(),
                disconnect: vi.fn(),
                reconnect: vi.fn(),
            },
            controlChannel: {
                abort,
                allowPermission,
                denyPermission,
            },
        });

        await manager.cancelSession();
        await manager.allowPermission('perm-1', { mode: 'acceptEdits' });
        await manager.denyPermission('perm-2', { decision: 'abort' });

        expect(abort).toHaveBeenCalledTimes(1);
        expect(allowPermission).toHaveBeenCalledWith('perm-1', { mode: 'acceptEdits' });
        expect(denyPermission).toHaveBeenCalledWith('perm-2', { decision: 'abort' });
    });

    it('delegates readiness and history refresh through the session-scoped history loader', async () => {
        const waitUntilReady = vi.fn(() => Promise.resolve(true));
        const refresh = vi.fn(() => Promise.resolve());
        const refreshIfStale = vi.fn(() => Promise.resolve());

        const manager = new OrbitRemoteSessionManager('session-3', {}, {
            connection: {
                connect: vi.fn(),
                disconnect: vi.fn(),
                reconnect: vi.fn(),
            },
            historyLoader: {
                waitUntilReady,
                refresh,
                refreshIfStale,
            },
        });

        const ready = await manager.waitUntilReady({
            timeoutMs: 2000,
            pollMs: 150,
            allowFallbackRefresh: true,
        });
        await manager.refreshHistory();
        await manager.refreshHistoryIfStale();

        expect(ready).toBe(true);
        expect(waitUntilReady).toHaveBeenCalledWith({
            timeoutMs: 2000,
            pollMs: 150,
            allowFallbackRefresh: true,
        });
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refreshIfStale).toHaveBeenCalledTimes(1);
    });
});
