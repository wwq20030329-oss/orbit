import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void | Promise<void>) => Promise<void> | void;
    create: (node: React.ReactElement) => {
        update: (node: React.ReactElement) => void;
        unmount: () => void;
    };
};

const hoisted = vi.hoisted(() => {
    const storageStateRef = {
        current: {
            sessions: {} as Record<string, Session>,
        },
    };
    const storageSubscribers = new Set<() => void>();

    return {
        storageStateRef,
        storageSubscribers,
        emitStorage: () => {
            storageSubscribers.forEach((listener) => listener());
        },
        routeRef: {
            current: {
                params: {
                    id: 'session-1',
                } as Record<string, string>,
            },
        },
        routerRef: {
            current: {
                replace: vi.fn(),
                back: vi.fn(),
            },
        },
        navigationRef: {
            current: {
                canGoBack: vi.fn(() => false),
                dispatch: vi.fn(),
            },
        },
        resolveSessionRoute: vi.fn(),
        getInitialSessionRouteResolution: vi.fn(),
        getSessionRoutePlaceholder: vi.fn(() => null),
        replaceToPhoneWorkspaceSession: vi.fn(),
        sessionViewSpy: vi.fn(),
        isTabletRef: {
            current: false,
        },
    };
});

vi.mock('@/sync/storage', () => ({
    storage: Object.assign(
        (selector?: (state: typeof hoisted.storageStateRef.current) => unknown) => {
            const React = require('react') as typeof import('react');
            return React.useSyncExternalStore(
                (listener) => {
                    hoisted.storageSubscribers.add(listener);
                    return () => {
                        hoisted.storageSubscribers.delete(listener);
                    };
                },
                () => (selector ? selector(hoisted.storageStateRef.current) : hoisted.storageStateRef.current),
                () => (selector ? selector(hoisted.storageStateRef.current) : hoisted.storageStateRef.current),
            );
        },
        {
            getState: () => hoisted.storageStateRef.current,
        },
    ),
}));

vi.mock('@react-navigation/native', () => ({
    DrawerActions: {
        openDrawer: () => ({ type: 'OPEN_DRAWER' }),
    },
    useNavigation: () => hoisted.navigationRef.current,
    useRoute: () => hoisted.routeRef.current,
}));

vi.mock('expo-router', () => ({
    useRouter: () => hoisted.routerRef.current,
}));

vi.mock('react-native', () => ({
    ActivityIndicator: () => null,
    Platform: { OS: 'ios' },
    Text: ({ children }: { children?: React.ReactNode }) => children ?? null,
    View: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                textSecondary: '#666',
                surfaceHigh: '#eee',
            },
        },
    }),
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/components/ChatHeaderView', () => ({
    ChatHeaderView: () => null,
}));

vi.mock('@/components/PhoneConversationShell', () => ({
    PhoneConversationShell: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/-session/SessionView', () => ({
    SessionView: (props: Record<string, unknown>) => {
        hoisted.sessionViewSpy(props);
        return null;
    },
}));

vi.mock('@/utils/phoneWorkspaceNavigation', () => ({
    replaceToPhoneWorkspaceSession: hoisted.replaceToPhoneWorkspaceSession,
}));

vi.mock('@/utils/sessionRouteResolution', () => ({
    getInitialSessionRouteResolution: hoisted.getInitialSessionRouteResolution,
    resolveSessionRoute: hoisted.resolveSessionRoute,
}));

vi.mock('@/utils/sessionRoutePlaceholder', () => ({
    getSessionRoutePlaceholder: hoisted.getSessionRoutePlaceholder,
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    replaceToSession: vi.fn(),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/responsive', () => ({
    useHeaderHeight: () => 0,
    useIsTablet: () => hoisted.isTabletRef.current,
}));

import SessionRouteScreen from '../../app/(app)/session/[id]';

function createSession(id: string, overrides: Partial<Session> = {}): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
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

describe('session/[id] route', () => {
    beforeEach(() => {
        hoisted.storageStateRef.current = {
            sessions: {},
        };
        hoisted.routeRef.current = {
            params: {
                id: 'session-1',
            },
        };
        hoisted.routerRef.current.replace.mockReset();
        hoisted.routerRef.current.back.mockReset();
        hoisted.navigationRef.current.canGoBack.mockReset();
        hoisted.navigationRef.current.canGoBack.mockReturnValue(false);
        hoisted.navigationRef.current.dispatch.mockReset();
        hoisted.resolveSessionRoute.mockReset();
        hoisted.getInitialSessionRouteResolution.mockReset();
        hoisted.getSessionRoutePlaceholder.mockReset();
        hoisted.getSessionRoutePlaceholder.mockReturnValue(null);
        hoisted.replaceToPhoneWorkspaceSession.mockReset();
        hoisted.sessionViewSpy.mockReset();
        hoisted.isTabletRef.current = false;
    });

    it('recovers on phones when the resolved session hydrates after route resolution', async () => {
        let resolveRoute!: (value: {
            initialSessionId: string | null;
            displaySessionId: string | null;
            resolvedSessionId: string | null;
            shouldReplaceRoute: boolean;
        }) => void;

        hoisted.getInitialSessionRouteResolution.mockReturnValue({
            initialSessionId: null,
            displaySessionId: null,
            resolvedSessionId: null,
            shouldReplaceRoute: false,
        });
        hoisted.resolveSessionRoute.mockReturnValue(new Promise((resolve) => {
            resolveRoute = resolve;
        }));

        let renderer!: {
            update: (node: React.ReactElement) => void;
            unmount: () => void;
        };

        await TestRenderer.act(async () => {
            renderer = TestRenderer.create(React.createElement(SessionRouteScreen));
        });

        await TestRenderer.act(async () => {
            resolveRoute({
                initialSessionId: null,
                displaySessionId: null,
                resolvedSessionId: 'session-2',
                shouldReplaceRoute: true,
            });
            await Promise.resolve();
        });

        expect(hoisted.replaceToPhoneWorkspaceSession).not.toHaveBeenCalled();

        hoisted.storageStateRef.current = {
            sessions: {
                'session-2': createSession('session-2', {
                    active: true,
                    activeAt: 2,
                    presence: 'online',
                }),
            },
        };

        await TestRenderer.act(async () => {
            hoisted.emitStorage();
        });

        expect(hoisted.replaceToPhoneWorkspaceSession).toHaveBeenCalledWith(
            hoisted.routerRef.current,
            'session-2',
        );

        renderer.unmount();
    });

    it('keeps archived native history routes pinned to the requested session', async () => {
        hoisted.isTabletRef.current = true;
        hoisted.routeRef.current = {
            params: {
                id: 'session-archived',
                history: '1',
            },
        };
        hoisted.storageStateRef.current = {
            sessions: {
                'session-archived': createSession('session-archived', {
                    metadata: {
                        machineId: 'machine-1',
                        codexThreadId: 'thread-1',
                        path: '/Users/test/project',
                        host: 'wwq-mac',
                        flavor: 'codex',
                        lifecycleState: 'archived',
                    },
                }),
            },
        };

        let renderer!: { unmount: () => void };

        await TestRenderer.act(async () => {
            renderer = TestRenderer.create(React.createElement(SessionRouteScreen));
        });

        expect(hoisted.getInitialSessionRouteResolution).not.toHaveBeenCalled();
        expect(hoisted.resolveSessionRoute).not.toHaveBeenCalled();
        expect(hoisted.sessionViewSpy).toHaveBeenCalledWith(expect.objectContaining({
            id: 'session-archived',
            headerVariant: 'default',
            nativeConnectionPending: false,
        }));

        renderer.unmount();
    });
});
