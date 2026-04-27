import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => {
        update: (node: React.ReactElement) => void;
        unmount: () => void;
    };
};

const hoisted = vi.hoisted(() => ({
    flashListProps: [] as any[],
    storage: vi.fn((selector?: (state: { localSettings: { markdownCopyV2: boolean } }) => unknown) => {
        const state = {
            localSettings: {
                markdownCopyV2: false,
            },
        };
        return selector ? selector(state) : state;
    }),
    useSessionMessages: vi.fn(() => ({
        messages: [{ id: 'store-message' }],
    })),
}));

vi.mock('@/sync/storage', () => ({
    storage: hoisted.storage,
    useSessionMessages: hoisted.useSessionMessages,
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    View: () => null,
}));

// FlashList v2 reaches into several `react-native` internals (Animated,
// TurboModuleRegistry, ...) that we deliberately do not expose through the
// bare `react-native` mock above. Stub the list component itself so the
// test harness never actually mounts the real FlashList.
vi.mock('@shopify/flash-list', () => ({
    FlashList: (props: any) => {
        hoisted.flashListProps.push(props);
        return null;
    },
}));

vi.mock('@/hooks/useOrbitRemoteSessionManager', () => ({
    useOrbitRemoteSessionManager: () => null,
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/utils/responsive', () => ({
    useHeaderHeight: () => 0,
}));

vi.mock('./layout', () => ({
    layout: { maxWidth: 640 },
}));

vi.mock('@/components/MessageView', () => ({
    MessageView: () => null,
}));

vi.mock('@/components/ExecutionChecklistCard', () => ({
    ExecutionChecklistCard: () => null,
}));

vi.mock('./ExecutionChecklistCard', () => ({
    ExecutionChecklistCard: () => null,
}));

vi.mock('@/remote/OrbitRemoteSessionManager', () => ({
    OrbitRemoteSessionManager: vi.fn(() => ({
        sendCurrentSessionMessage: vi.fn(() => Promise.resolve()),
    })),
}));

vi.mock('@/components/ChatFooter', () => ({
    ChatFooter: () => null,
}));

import { ChatList } from './ChatList';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        agentState: {
            controlledByUser: true,
            requests: {},
        },
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

describe('ChatList', () => {
    beforeEach(() => {
        hoisted.flashListProps = [];
        hoisted.useSessionMessages.mockClear();
    });

    it('does not subscribe to session messages when a stable override is provided', () => {
        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(ChatList, {
                session: createSession(),
            messagesOverride: [{ id: 'override-message' }] as any,
        }));
        });

        expect(hoisted.useSessionMessages).not.toHaveBeenCalled();
    });

    it('subscribes to session messages when no override is provided', () => {
        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(ChatList, {
                session: {
                    ...createSession(),
                    id: 'session-2',
                    agentState: null,
                },
            }));
        });

        expect(hoisted.useSessionMessages).toHaveBeenCalledWith('session-2');
    });

    it('starts an opened conversation at the latest message', () => {
        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(ChatList, {
                session: createSession(),
                messagesOverride: [{ id: 'latest-message' }] as any,
            }));
        });

        const flashListProps = hoisted.flashListProps.at(-1);
        expect(flashListProps.initialScrollIndex).toBe(0);
        expect(flashListProps.maintainVisibleContentPosition).toMatchObject({
            startRenderingFromBottom: true,
            autoscrollToTopThreshold: 0.2,
        });
        expect(typeof flashListProps.onLoad).toBe('function');
    });

    it('skips resubscribing when only unrelated session fields change', () => {
        const sharedMetadata = { title: 'hello' } as any;
        let renderer!: {
            update: (node: React.ReactElement) => void;
            unmount: () => void;
        };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(ChatList, {
                session: createSession({
                    id: 'session-3',
                    metadata: sharedMetadata,
                }),
            }));
        });

        expect(hoisted.useSessionMessages).toHaveBeenCalledTimes(1);

        TestRenderer.act(() => {
            renderer.update(React.createElement(ChatList, {
                session: createSession({
                    id: 'session-3',
                    updatedAt: 2,
                    seq: 2,
                    presence: 2,
                    metadata: sharedMetadata,
                }),
            }));
        });

        expect(hoisted.useSessionMessages).toHaveBeenCalledTimes(1);
        TestRenderer.act(() => {
            renderer.unmount();
        });
    });
});
