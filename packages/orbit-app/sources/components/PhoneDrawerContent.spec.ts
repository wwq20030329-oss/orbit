import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock, useSessionHistoryControllerMock, drawerStatusState } = vi.hoisted(() => ({
    navigateMock: vi.fn(),
    drawerStatusState: {
        value: 'open' as 'open' | 'closed',
    },
    useSessionHistoryControllerMock: vi.fn(() => ({
        currentCli: 'codex',
        data: [],
        listReady: true,
        sectionsState: {
            sections: [],
            sectionsByTool: {
                claude: { count: 0 },
                codex: { count: 0 },
                gemini: { count: 0 },
                openclaw: { count: 0 },
            },
        },
        sessionCount: 0,
    })),
}));

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void | Promise<void>) => Promise<void> | void;
    create: (node: React.ReactElement) => {
        root: {
            findAllByType: (type: string) => Array<{ props: { onPress?: () => void } }>;
        };
        unmount: () => void;
    };
};

vi.mock('react-native', () => {
    const React = require('react');
    return {
        InteractionManager: {
            runAfterInteractions: (callback: () => void) => {
                callback();
                return { cancel: vi.fn() };
            },
        },
        Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) => (
            React.createElement('Pressable', { onPress }, children)
        ),
        View: ({ children }: { children?: React.ReactNode }) => React.createElement('View', null, children),
    };
});

vi.mock('expo-router', () => ({
    usePathname: () => '/',
    useRouter: () => ({ navigate: navigateMock }),
}));

vi.mock('@react-navigation/drawer', () => ({
    useDrawerStatus: () => drawerStatusState.value,
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: (theme: any) => unknown) => factory({
            colors: {
                groupped: { background: '#fff' },
                surface: '#f4f4f4',
                text: '#111',
                textSecondary: '#666',
                divider: '#ddd',
            },
        }),
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#111',
                textSecondary: '#666',
            },
        },
    }),
}));

vi.mock('@/components/StyledText', () => {
    const React = require('react');
    return {
        Text: ({ children }: { children?: React.ReactNode }) => React.createElement('Text', null, children),
    };
});

vi.mock('@/components/SessionsList', () => ({
    SessionsList: () => null,
}));

vi.mock('@/components/SessionsListWrapper', () => ({
    SessionsListWrapper: () => null,
}));

vi.mock('@/components/sessionHistory/SessionHistoryDrawerHeader', () => ({
    SessionHistoryDrawerHeader: () => null,
}));

vi.mock('@/hooks/useSessionHistoryController', () => ({
    useSessionHistoryController: useSessionHistoryControllerMock,
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/utils/phoneWorkspaceNavigation', () => ({
    navigateToPhoneWorkspaceHome: vi.fn(),
}));

import { PhoneDrawerContent } from './PhoneDrawerContent';

describe('PhoneDrawerContent', () => {
    beforeEach(() => {
        navigateMock.mockClear();
        useSessionHistoryControllerMock.mockClear();
        drawerStatusState.value = 'open';
    });

    it('opens project sessions in a separate picker without switching the drawer list', async () => {
        const closeDrawerMock = vi.fn();
        let renderer!: ReturnType<typeof TestRenderer.create>;

        await TestRenderer.act(async () => {
            renderer = TestRenderer.create(React.createElement(PhoneDrawerContent, {
                drawerNavigation: { closeDrawer: closeDrawerMock },
            }));
        });

        const pressables = renderer.root.findAllByType('Pressable');

        await TestRenderer.act(async () => {
            pressables[0]?.props.onPress?.();
            await Promise.resolve();
        });

        expect(closeDrawerMock).toHaveBeenCalledTimes(1);
        expect(navigateMock).toHaveBeenCalledWith('/project-sessions');
        expect(useSessionHistoryControllerMock).toHaveBeenCalledWith(expect.objectContaining({
            view: 'sessions',
        }));
        expect(useSessionHistoryControllerMock).not.toHaveBeenCalledWith(expect.objectContaining({
            view: 'history',
        }));
        renderer.unmount();
    });

    it('does not mount the session list loader while the drawer is closed', async () => {
        drawerStatusState.value = 'closed';
        let renderer!: ReturnType<typeof TestRenderer.create>;

        await TestRenderer.act(async () => {
            renderer = TestRenderer.create(React.createElement(PhoneDrawerContent));
        });

        expect(useSessionHistoryControllerMock).not.toHaveBeenCalled();
        renderer.unmount();
    });
});
