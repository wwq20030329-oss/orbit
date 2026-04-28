import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => { unmount: () => void };
};

const hoisted = vi.hoisted(() => ({
    requestReview: vi.fn(),
    setPreferredCliToolTab: vi.fn(),
    setCliThreadScopeByTool: vi.fn(),
    setDrawerPinnedCliThreadIds: vi.fn(),
    setDrawerHiddenCliThreadIds: vi.fn(),
    drawerPinnedCliThreadIds: {} as Record<string, number>,
    drawerHiddenCliThreadIds: {} as Record<string, number>,
    buildCliThreadToolSectionsState: vi.fn(),
    flashList: vi.fn(() => null),
}));

function createCliThreadSectionsState() {
    const createSection = (tool: 'claude' | 'codex' | 'gemini' | 'openclaw', overrides: Record<string, unknown> = {}) => ({
        tool,
        title: tool,
        count: 0,
        projectCount: 0,
        newestUpdatedAt: null,
        items: [],
        projects: [],
        ...overrides,
    });

    const codexSection = createSection('codex', {
        count: 1,
        projectCount: 1,
        newestUpdatedAt: 10,
        items: [
            {
                id: 'codex:thread-1',
                source: 'session',
                tool: 'codex',
                title: 'Thread 1',
                updatedAt: 10,
                projectPath: '/Users/test/project',
                session: null,
                entry: null,
            },
        ],
    });

    return {
        sections: [codexSection],
        sectionsByTool: {
            claude: createSection('claude'),
            codex: codexSection,
            gemini: createSection('gemini'),
            openclaw: createSection('openclaw'),
        },
    };
}

vi.mock('react-native', () => {
    const React = require('react');
    class AnimatedValue {
        value: number;

        constructor(value: number) {
            this.value = value;
        }

        interpolate() {
            return this.value;
        }
    }

    return {
        View: ({ children }: { children?: React.ReactNode }) => React.createElement('View', null, children),
        Pressable: ({ children }: { children?: React.ReactNode }) => React.createElement('Pressable', null, children),
        FlatList: () => null,
        ActivityIndicator: () => null,
        ActionSheetIOS: {
            showActionSheetWithOptions: vi.fn(),
        },
        Platform: {
            OS: 'ios',
            select: (options: Record<string, unknown>) => options.ios ?? options.default,
        },
        Animated: {
            Value: AnimatedValue,
            View: ({ children }: { children?: React.ReactNode }) => React.createElement('AnimatedView', null, children),
            timing: () => ({
                start: (callback?: () => void) => callback?.(),
            }),
        },
        Easing: {
            cubic: (value: number) => value,
            out: (easing: unknown) => easing,
        },
        useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    };
});

vi.mock('@shopify/flash-list', () => ({
    FlashList: hoisted.flashList,
}));

vi.mock('react-native-gesture-handler', () => {
    const React = require('react');
    return {
        Swipeable: ({ children }: { children?: React.ReactNode }) => React.createElement('Swipeable', null, children),
    };
});

vi.mock('@/components/StyledText', () => {
    const React = require('react');
    return {
        Text: ({ children }: { children?: React.ReactNode }) => React.createElement('Text', null, children),
    };
});

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            localSettings: {
                drawerHiddenCliThreadIds: hoisted.drawerHiddenCliThreadIds,
            },
            applyLocalSettings: vi.fn(),
        }),
    },
    useLocalSettingMutable: (name: string) => {
        if (name === 'preferredCliToolTab') {
            return ['codex', hoisted.setPreferredCliToolTab];
        }

        if (name === 'drawerPinnedCliThreadIds') {
            return [hoisted.drawerPinnedCliThreadIds, hoisted.setDrawerPinnedCliThreadIds];
        }

        if (name === 'drawerHiddenCliThreadIds') {
            return [hoisted.drawerHiddenCliThreadIds, hoisted.setDrawerHiddenCliThreadIds];
        }

        return [{ codex: 'current-project' }, hoisted.setCliThreadScopeByTool];
    },
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: (theme: {
            colors: {
                groupped: { background: string; sectionTitle: string };
                surface: string;
                text: string;
                textSecondary: string;
                divider: string;
                surfaceHigh: string;
                status: { error: string };
            };
        }) => unknown) => factory({
            colors: {
                groupped: { background: '#ffffff', sectionTitle: '#999999' },
                surface: '#f2f2f2',
                text: '#111111',
                textSecondary: '#666666',
                divider: '#dddddd',
                surfaceHigh: '#e5e5e5',
                status: { error: '#ff3b30' },
            },
        }),
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                textSecondary: '#666666',
            },
        },
    }),
}));

vi.mock('@/utils/requestReview', () => ({
    requestReview: hoisted.requestReview,
}));

vi.mock('./UpdateBanner', () => ({
    UpdateBanner: () => null,
}));

vi.mock('./layout', () => ({
    layout: { maxWidth: 640 },
}));

vi.mock('@/hooks/useNavigateToSession', () => ({
    useNavigateDirectlyToSession: () => vi.fn(),
    useNavigateToSession: () => vi.fn(),
}));

vi.mock('@/hooks/useOrbitAction', () => ({
    useOrbitAction: (action: (...args: unknown[]) => unknown) => [false, action],
}));

vi.mock('@/utils/cliThreadList', () => ({
    buildCliThreadToolSectionsState: hoisted.buildCliThreadToolSectionsState,
    CLI_THREAD_TOOL_ORDER: ['claude', 'codex', 'gemini', 'openclaw'],
    formatCliThreadUpdatedAt: () => '1m ago',
    getCliSectionTitle: (tool: string) => tool,
    getCliThreadScopedProjects: (section: { projects?: unknown[] }) => ({
        scope: 'current-project',
        scopeProject: null,
        projects: section.projects ?? [],
        projectCount: (section.projects ?? []).length,
        threadCount: 0,
    }),
    pickPreferredCliThreadTool: () => 'codex',
}));

vi.mock('@/utils/openCliThreadItem', () => ({
    openCliThreadItem: vi.fn(),
}));

vi.mock('@/modal', () => ({
    Modal: {
        confirm: vi.fn(),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/phoneWorkspaceNavigation', () => ({
    activatePhoneWorkspaceSession: vi.fn(),
    shouldUsePhoneWorkspaceNavigation: () => false,
}));

import { SessionsList } from './SessionsList';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 10,
        active: true,
        activeAt: 10,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'test-mac',
            flavor: 'codex',
            codexThreadId: 'thread-1',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        draft: null,
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        latestUsage: null,
        liveRuntime: null,
        ...overrides,
    };
}

function createNativeCliEntry(overrides: Partial<NativeCliHistoryEntry> = {}): NativeCliHistoryEntry {
    return {
        id: 'codex:thread-native-1',
        tool: 'codex',
        backendId: 'thread-native-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/project',
        projectRoot: '/Users/test/project',
        title: 'Native Thread',
        summary: null,
        updatedAt: 11,
        isLive: true,
        ...overrides,
    };
}

describe('SessionsList', () => {
    beforeEach(() => {
        hoisted.requestReview.mockClear();
        hoisted.flashList.mockClear();
        hoisted.setDrawerPinnedCliThreadIds.mockClear();
        hoisted.setDrawerHiddenCliThreadIds.mockClear();
        hoisted.drawerPinnedCliThreadIds = {};
        hoisted.drawerHiddenCliThreadIds = {};
        hoisted.buildCliThreadToolSectionsState.mockReset();
        hoisted.buildCliThreadToolSectionsState.mockReturnValue(createCliThreadSectionsState());
    });

    it('does not request a review when rendered inside the drawer', () => {
        const data = [{ type: 'session', session: createSession() }] as const;

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(SessionsList, {
                data: [...data],
                mode: 'drawer',
                drawerView: 'history',
                precomputedToolSectionsState: createCliThreadSectionsState(),
                preselectedTool: 'codex',
            }));
        });

        expect(hoisted.requestReview).not.toHaveBeenCalled();
    });

    it('keeps native CLI entries out of the lightweight drawer sessions view', () => {
        const nativeItem = {
            type: 'native-cli-session',
            entry: createNativeCliEntry(),
        } as const;

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(SessionsList, {
                data: [nativeItem],
                mode: 'drawer',
                drawerView: 'sessions',
            }));
        });

        expect(
            hoisted.buildCliThreadToolSectionsState.mock.calls.every(([items]) =>
                Array.isArray(items)
                && items.every((item) => item?.type !== 'native-cli-session'),
            ),
        ).toBe(true);
    });

    it('keeps native CLI entries visible in the drawer history view', () => {
        const nativeItem = {
            type: 'native-cli-session',
            entry: createNativeCliEntry(),
        } as const;

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(SessionsList, {
                data: [nativeItem],
                mode: 'drawer',
                drawerView: 'history',
            }));
        });

        expect(
            hoisted.buildCliThreadToolSectionsState.mock.calls.some(([items]) =>
                Array.isArray(items)
                && items.some((item) => item?.type === 'native-cli-session'),
            ),
        ).toBe(true);
    });

    it('keeps the drawer as a short recent list', () => {
        const items = Array.from({ length: 20 }, (_, index) => ({
            id: `codex:thread-${index}`,
            source: 'session',
            tool: 'codex',
            title: `Thread ${index}`,
            updatedAt: 1_000 - index,
            projectPath: '/Users/test/project',
            session: null,
            entry: null,
        }));
        hoisted.drawerPinnedCliThreadIds = {
            'codex:thread-19': 2_000,
        };
        hoisted.drawerHiddenCliThreadIds = {
            'codex:thread-0': 2_000,
        };
        const codexSection = {
            tool: 'codex',
            title: 'codex',
            count: items.length,
            projectCount: 1,
            newestUpdatedAt: items[0].updatedAt,
            items,
            projects: [],
        };

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(SessionsList, {
                data: [],
                mode: 'drawer',
                drawerView: 'sessions',
                precomputedToolSectionsState: {
                    sections: [codexSection],
                    sectionsByTool: {
                        claude: { ...codexSection, tool: 'claude', title: 'claude', count: 0, items: [] },
                        codex: codexSection,
                        gemini: { ...codexSection, tool: 'gemini', title: 'gemini', count: 0, items: [] },
                        openclaw: { ...codexSection, tool: 'openclaw', title: 'openclaw', count: 0, items: [] },
                    },
                } as any,
                preselectedTool: 'codex',
            }));
        });

        const flashListCalls = hoisted.flashList.mock.calls as unknown as Array<[{ data?: Array<{
            type: string;
            item?: { id: string };
        }> }]>;
        const drawerRows = flashListCalls.at(-1)?.[0]?.data ?? [];
        const visibleThreads = drawerRows.filter((row: { type: string }) => row.type === 'item');
        expect(visibleThreads).toHaveLength(12);
        expect(visibleThreads[0]?.item?.id).toBe('codex:thread-19');
        expect(visibleThreads.map((row) => row.item?.id)).not.toContain('codex:thread-0');
    });

    it('requests a review when the default list has content', () => {
        const data = [{ type: 'session', session: createSession() }] as const;

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(SessionsList, {
                data: [...data],
            }));
        });

        expect(hoisted.requestReview).toHaveBeenCalledTimes(1);
    });
});
