import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => {
        update: (node: React.ReactElement) => void;
        unmount: () => void;
    };
};

const hoisted = vi.hoisted(() => {
    const instances: Array<{
        triggerRoute: (sessionId: string) => void;
        triggerBackgroundError: (error: unknown) => void;
    }> = [];

    return {
        constructorMock: vi.fn((sessionId: string, callbacks: {
            onSessionRouted?: (targetSessionId: string) => void;
            onBackgroundError?: (error: unknown) => void;
        } = {}) => {
            const instance = {
                sessionId,
                triggerRoute: (targetSessionId: string) => callbacks.onSessionRouted?.(targetSessionId),
                triggerBackgroundError: (error: unknown) => callbacks.onBackgroundError?.(error),
            };
            instances.push(instance);
            return instance;
        }),
        instances,
    };
});

vi.mock('@/remote/OrbitRemoteSessionManager', () => ({
    OrbitRemoteSessionManager: hoisted.constructorMock,
}));

import { useOrbitRemoteSessionManager } from './useOrbitRemoteSessionManager';

describe('useOrbitRemoteSessionManager', () => {
    beforeEach(() => {
        hoisted.constructorMock.mockClear();
        hoisted.instances.length = 0;
    });

    it('reuses the same manager while the session id stays the same', () => {
        function Probe(props: { sessionId: string; onRoute: (sessionId: string) => void }) {
            useOrbitRemoteSessionManager(props.sessionId, {
                onSessionRouted: props.onRoute,
            });
            return null;
        }

        const firstRoute = vi.fn();
        const secondRoute = vi.fn();
        let renderer!: { update: (node: React.ReactElement) => void; unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe, {
                sessionId: 'session-1',
                onRoute: firstRoute,
            }));
        });

        expect(hoisted.constructorMock).toHaveBeenCalledTimes(1);

        TestRenderer.act(() => {
            renderer.update(React.createElement(Probe, {
                sessionId: 'session-1',
                onRoute: secondRoute,
            }));
        });

        expect(hoisted.constructorMock).toHaveBeenCalledTimes(1);

        hoisted.instances[0]?.triggerRoute('session-2');
        expect(firstRoute).not.toHaveBeenCalled();
        expect(secondRoute).toHaveBeenCalledWith('session-2');
    });

    it('creates a new manager when the session id changes', () => {
        function Probe(props: { sessionId: string }) {
            useOrbitRemoteSessionManager(props.sessionId);
            return null;
        }

        let renderer!: { update: (node: React.ReactElement) => void; unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe, {
                sessionId: 'session-1',
            }));
        });

        TestRenderer.act(() => {
            renderer.update(React.createElement(Probe, {
                sessionId: 'session-2',
            }));
        });

        expect(hoisted.constructorMock).toHaveBeenCalledTimes(2);
        expect(hoisted.constructorMock.mock.calls[0]?.[0]).toBe('session-1');
        expect(hoisted.constructorMock.mock.calls[1]?.[0]).toBe('session-2');
    });
});
