import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/apiSocket', () => ({
    apiSocket: {
        onStatusChange: () => () => {},
    },
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        waitForSessionReady: vi.fn(() => Promise.resolve(true)),
        refreshSessionMessages: vi.fn(() => Promise.resolve()),
        refreshSessionMessagesIfStale: vi.fn(() => Promise.resolve()),
        onSessionVisible: vi.fn(),
        onSessionHidden: vi.fn(),
    },
}));

import { OrbitSessionConnection } from './OrbitSessionConnection';

describe('OrbitSessionConnection', () => {
    it('marks the session visible, uses stale refresh for reconnect-like reasons, and uses full refresh for realtime gaps', async () => {
        const onSessionVisible = vi.fn();
        const onSessionHidden = vi.fn();
        const refreshSessionMessages = vi.fn(() => Promise.resolve());
        const refreshSessionMessagesIfStale = vi.fn(() => Promise.resolve());
        const listeners: Array<(status: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = [];
        const refreshHandlers: Array<(
            reason: 'app-active' | 'socket-reconnected' | 'realtime-message-gap' | 'session-control-returned'
        ) => void> = [];

        const connection = new OrbitSessionConnection('session-1', {}, {
            onSessionVisible,
            onSessionHidden,
            createHistoryLoader: () => ({
                waitUntilReady: vi.fn(() => Promise.resolve(true)),
                refresh: refreshSessionMessages,
                refreshIfStale: refreshSessionMessagesIfStale,
            }),
            onSocketStatusChange: (listener) => {
                listeners.push(listener);
                return () => {
                    const index = listeners.indexOf(listener);
                    if (index >= 0) {
                        listeners.splice(index, 1);
                    }
                };
            },
            registerRefreshHandler: (_sessionId, handler) => {
                refreshHandlers.push(handler);
                return () => {
                    const index = refreshHandlers.indexOf(handler);
                    if (index >= 0) {
                        refreshHandlers.splice(index, 1);
                    }
                };
            },
        });

        connection.connect();
        connection.connect();
        await Promise.resolve();
        await Promise.resolve();

        expect(onSessionVisible).toHaveBeenCalledTimes(1);
        expect(refreshSessionMessagesIfStale).toHaveBeenCalledTimes(0);

        listeners[0]?.('connected');
        await Promise.resolve();
        await Promise.resolve();
        expect(refreshSessionMessagesIfStale).toHaveBeenCalledTimes(1);

        refreshHandlers[0]?.('app-active');
        await Promise.resolve();
        await Promise.resolve();
        expect(refreshSessionMessagesIfStale).toHaveBeenCalledTimes(2);
        expect(refreshSessionMessages).not.toHaveBeenCalled();

        refreshHandlers[0]?.('realtime-message-gap');
        await Promise.resolve();
        await Promise.resolve();
        expect(refreshSessionMessages).toHaveBeenCalledTimes(1);

        refreshHandlers[0]?.('session-control-returned');
        await Promise.resolve();
        await Promise.resolve();
        expect(refreshSessionMessages).toHaveBeenCalledTimes(2);

        connection.disconnect();
        expect(onSessionHidden).toHaveBeenCalledWith('session-1');

        listeners[0]?.('connected');
        refreshHandlers[0]?.('socket-reconnected');
        await Promise.resolve();
        expect(refreshSessionMessagesIfStale).toHaveBeenCalledTimes(2);
    });
});
