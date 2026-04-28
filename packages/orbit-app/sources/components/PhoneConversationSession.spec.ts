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

const hoisted = vi.hoisted(() => {
    const applyLocalSettings = vi.fn();
    const cancelSession = vi.fn(() => Promise.resolve());
    const remoteSessionManager = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        sendCurrentSessionMessage: vi.fn(() => Promise.resolve('session-1')),
        cancelSession,
    };

    return {
        composerRenderCount: 0,
        flashListProps: [] as any[],
        applyLocalSettings,
        composerProps: [] as any[],
        setAgentType: vi.fn(),
        clearDraft: vi.fn(),
        pickFileAttachments: vi.fn(() => Promise.resolve()),
        pickImageAttachments: vi.fn(() => Promise.resolve()),
        removeAttachment: vi.fn(),
        remoteSessionManager,
        remoteSessionView: null as any,
        slashChipRenderCount: 0,
    };
});

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native', () => ({
    ActivityIndicator: () => null,
    Platform: { OS: 'ios' },
    Text: ({ children }: { children?: React.ReactNode }) => children ?? null,
    View: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// FlashList v2 reaches into several `react-native` internals we deliberately
// do not expose through the bare mock above. Stub the list component so the
// test harness never actually mounts the real FlashList.
vi.mock('@shopify/flash-list', () => ({
    FlashList: (props: any) => {
        hoisted.flashListProps.push(props);
        return null;
    },
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native-keyboard-controller', () => ({
    KeyboardAvoidingView: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: any) => factory({
            colors: {
                button: {
                    primary: { background: '#000', tint: '#fff' },
                },
                text: '#111',
                textSecondary: '#666',
                surface: '#fff',
                divider: '#ddd',
                agentEventText: '#999',
                groupped: { background: '#f2f2f2' },
            },
        }),
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                button: {
                    primary: { background: '#000', tint: '#fff' },
                },
                text: '#111',
                textSecondary: '#666',
                surface: '#fff',
                divider: '#ddd',
                agentEventText: '#999',
                groupped: { background: '#f2f2f2' },
            },
        },
    }),
}));

vi.mock('@/sync/storage', () => {
    type StorageState = {
        settings: {
            agentInputEnterToSend: boolean;
        };
        localSettings: {
            markdownCopyV2: boolean;
            preferredCliToolTab: string;
        };
    };
    type StorageMock = ((selector?: (state: StorageState) => unknown) => unknown) & {
        getState: () => {
            localSettings: {
                preferredCliToolTab: string;
            };
            applyLocalSettings: typeof hoisted.applyLocalSettings;
        };
    };

    const storage: StorageMock = Object.assign(
        vi.fn((selector?: (state: StorageState) => unknown) => {
            const state = {
                settings: {
                    agentInputEnterToSend: false,
                },
                localSettings: {
                    markdownCopyV2: false,
                    preferredCliToolTab: 'claude',
                },
            };
            return selector ? selector(state) : state;
        }),
        {
            getState: () => ({
                localSettings: {
                    preferredCliToolTab: 'claude',
                },
                applyLocalSettings: hoisted.applyLocalSettings,
            }),
        },
    );

    return {
        storage,
        useRemoteSessionView: () => hoisted.remoteSessionView,
    };
});

vi.mock('@/components/PhoneConversationShell', () => ({
    PhoneConversationShell: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('@/components/PhoneMessageComposerCard', () => ({
    PhoneMessageComposerCard: (props: any) => {
        hoisted.composerRenderCount += 1;
        hoisted.composerProps.push(props);
        return null;
    },
}));

vi.mock('@/components/ComposerSlashChips', () => ({
    ComposerSlashChips: () => {
        hoisted.slashChipRenderCount += 1;
        return null;
    },
}));

vi.mock('@/components/MessageView', () => ({
    MessageView: () => null,
}));

vi.mock('@/components/ExecutionChecklistCard', () => ({
    ExecutionChecklistCard: () => null,
}));

vi.mock('@/components/ChatFooter', () => ({
    ChatFooter: () => null,
}));

vi.mock('@/components/RoundButton', () => ({
    RoundButton: () => null,
}));

vi.mock('@/components/tools/ToolGroupChip', () => ({
    ToolGroupChip: () => null,
}));

vi.mock('@/components/PermissionStickyBanner', () => ({
    PermissionStickyBanner: () => null,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/hooks/orbitActionError', () => ({
    getOrbitActionErrorMessage: () => 'error',
}));

vi.mock('@/hooks/useDraft', () => ({
    useDraft: () => ({
        clearDraft: hoisted.clearDraft,
    }),
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: vi.fn(),
    },
}));

vi.mock('@/components/modelModeOptions', () => ({
    getAvailableEffortLevels: () => [],
    getAvailableSessionModels: () => [],
    getAvailableSessionPermissionModes: () => [],
    getDefaultEffortKeyForModel: () => null,
    getDefaultModelKey: () => 'default',
    getDefaultPermissionModeKey: () => 'default',
    resolveCurrentOption: () => null,
}));

vi.mock('@/utils/nativeCliHistory', () => ({
    getSessionDisplayTitle: () => 'Session Title',
}));

vi.mock('@/utils/sessionUtils', () => ({
    getResumeCommandBlock: () => null,
}));

vi.mock('@/hooks/useSessionQuickActions', () => ({
    useSessionQuickActions: () => ({
        canResume: false,
        canShowResume: false,
        resumeSession: vi.fn(),
        resumeSessionSubtitle: 'Resume later',
        resumingSession: false,
    }),
}));

vi.mock('@/hooks/useComposerAttachments', () => ({
    useComposerAttachments: () => ({
        attachments: [],
        clearAttachments: vi.fn(),
        pickFileAttachments: hoisted.pickFileAttachments,
        pickImageAttachments: hoisted.pickImageAttachments,
        removeAttachment: hoisted.removeAttachment,
    }),
}));

vi.mock('@/utils/composerAttachments', () => ({
    buildComposerDisplayText: () => '',
    buildMessageWithAttachments: () => '',
}));

vi.mock('@/utils/sessionControlState', () => ({
    getSessionControlState: () => ({
        isInactiveArchivedSession: false,
        isDisconnected: false,
        status: {
            state: 'thinking',
            statusText: 'thinking',
            statusColor: '#09f',
            statusDotColor: '#09f',
            isPulsing: true,
        },
    }),
}));

vi.mock('@/utils/phoneCli', () => ({
    PHONE_CLI_TOOL_ORDER: ['claude', 'codex'],
    getPhoneCliLabel: () => 'Claude',
    getSessionPhoneCli: () => 'claude',
}));

vi.mock('@/utils/phoneWorkspaceNavigation', () => ({
    activatePhoneWorkspaceSession: vi.fn(),
    clearPhoneWorkspaceSession: vi.fn(),
}));

vi.mock('@/utils/sessionAutoResume', () => ({
    shouldAutoResumeSession: () => false,
}));

vi.mock('@/hooks/useNewSessionDraft', () => ({
    useNewSessionDraftActions: () => ({
        setAgentType: hoisted.setAgentType,
    }),
}));

vi.mock('@/remote/OrbitRemoteSessionManager', () => ({
    OrbitRemoteSessionManager: vi.fn(() => hoisted.remoteSessionManager),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import { PhoneConversationSession } from './PhoneConversationSession';

function createSession(updatedAt: number): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt,
        active: true,
        activeAt: 1,
        metadata: {
            flavor: 'claude',
            path: '/tmp/project',
            host: 'machine',
        } as any,
        metadataVersion: 0,
        agentState: {
            controlledByUser: false,
            requests: {},
        },
        agentStateVersion: 0,
        thinking: true,
        thinkingAt: 1,
        presence: 'online',
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        liveRuntime: null,
    };
}

describe('PhoneConversationSession', () => {
    beforeEach(() => {
        hoisted.composerProps = [];
        hoisted.flashListProps = [];
        hoisted.slashChipRenderCount = 0;
    });

    it('keeps the composer subtree stable when only session timestamps change during thinking', () => {
        hoisted.composerRenderCount = 0;
        hoisted.remoteSessionView = {
            session: createSession(1),
            messages: [],
            isLoaded: true,
            isDisconnected: false,
            sessionControlState: {
                isInactiveArchivedSession: false,
                isDisconnected: false,
                status: {
                    state: 'thinking',
                    statusText: 'thinking',
                    statusColor: '#09f',
                    statusDotColor: '#09f',
                    isPulsing: true,
                },
            },
            pendingSeed: null,
        };

        let renderer!: {
            update: (node: React.ReactElement) => void;
            unmount: () => void;
        };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
            }));
        });

        expect(hoisted.composerRenderCount).toBe(1);

        hoisted.remoteSessionView = {
            ...hoisted.remoteSessionView,
            session: createSession(2),
        };

        TestRenderer.act(() => {
            renderer.update(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
            }));
        });

        expect(hoisted.composerRenderCount).toBe(1);

        TestRenderer.act(() => {
            renderer.unmount();
        });
    });

    it('opens the phone conversation at the latest item', () => {
        hoisted.remoteSessionView = {
            session: createSession(1),
            messages: [{ id: 'latest-message' }],
            isLoaded: true,
            isDisconnected: false,
            sessionControlState: {
                isInactiveArchivedSession: false,
                isDisconnected: false,
                status: {
                    state: 'thinking',
                    statusText: 'thinking',
                    statusColor: '#09f',
                    statusDotColor: '#09f',
                    isPulsing: true,
                },
            },
            pendingSeed: null,
        };

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
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

    it('does not render slash command chips above the composer', () => {
        hoisted.remoteSessionView = {
            session: createSession(1),
            messages: [],
            isLoaded: true,
            isDisconnected: false,
            sessionControlState: {
                isInactiveArchivedSession: false,
                isDisconnected: false,
                status: {
                    state: 'thinking',
                    statusText: 'thinking',
                    statusColor: '#09f',
                    statusDotColor: '#09f',
                    isPulsing: true,
                },
            },
            pendingSeed: null,
        };

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
            }));
        });

        expect(hoisted.slashChipRenderCount).toBe(0);
    });

    it('keeps the abort action visible while a thinking session reconnects', () => {
        hoisted.remoteSessionView = {
            session: createSession(1),
            messages: [],
            isLoaded: true,
            isDisconnected: true,
            sessionControlState: {
                isInactiveArchivedSession: false,
                isDisconnected: true,
                status: {
                    state: 'disconnected',
                    statusText: 'last seen just now',
                    statusColor: '#999',
                    statusDotColor: '#999',
                    isPulsing: false,
                },
            },
            pendingSeed: null,
        };

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
            }));
        });

        const flashListProps = hoisted.flashListProps.at(-1);
        expect(flashListProps.data[0]).toMatchObject({
            kind: 'run-state',
            runState: {
                kind: 'reconnecting',
                isRunning: true,
                canAbort: true,
                canSendMessages: false,
            },
        });

        const composerProps = hoisted.composerProps.at(-1);
        expect(composerProps.showAbortButton).toBe(true);
        expect(composerProps.onAbort).toBeTypeOf('function');
        expect(composerProps.activityHint).toBeUndefined();
    });

    it('renders thinking as an inline conversation item while keeping stop in the send button', () => {
        hoisted.remoteSessionView = {
            session: createSession(1),
            messages: [],
            isLoaded: true,
            isDisconnected: false,
            sessionControlState: {
                isInactiveArchivedSession: false,
                isDisconnected: false,
                status: {
                    state: 'thinking',
                    statusText: 'thinking',
                    statusColor: '#09f',
                    statusDotColor: '#09f',
                    isPulsing: true,
                },
            },
            pendingSeed: null,
        };

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(PhoneConversationSession, {
                sessionId: 'session-1',
            }));
        });

        const flashListProps = hoisted.flashListProps.at(-1);
        expect(flashListProps.data[0]).toMatchObject({
            kind: 'run-state',
            runState: {
                kind: 'running',
                labelKey: 'sessionRun.running',
                canAbort: true,
                canSendMessages: false,
            },
        });

        const composerProps = hoisted.composerProps.at(-1);
        expect(composerProps.showAbortButton).toBe(true);
    });
});
