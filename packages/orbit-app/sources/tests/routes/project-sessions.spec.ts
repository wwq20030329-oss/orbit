import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Animated: {
        Value: class {},
    },
    Easing: {
        cubic: {},
        out: (value: unknown) => value,
        in: (value: unknown) => value,
    },
    Pressable: () => null,
    View: () => null,
    useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ back: () => {}, replace: () => {} }),
}));

vi.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ canGoBack: () => false }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        absoluteFillObject: {},
        create: () => ({}),
        hairlineWidth: 1,
    },
    useUnistyles: () => ({ theme: { colors: {} } }),
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

vi.mock('@/components/SessionsList', () => ({
    SessionsList: () => null,
}));

vi.mock('@/components/SessionsListWrapper', () => ({
    SessionsListWrapper: () => null,
}));

vi.mock('@/hooks/useSessionHistoryController', () => ({
    useSessionHistoryController: () => ({
        currentCli: 'claude',
        data: [],
        listReady: true,
        sectionsState: null,
    }),
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        refreshMachines: () => Promise.resolve(),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/components/layout', () => ({
    layout: {
        maxWidth: 480,
    },
}));

import { buildProjectSessionsPanelMetrics } from '../../app/(app)/project-sessions';

describe('buildProjectSessionsPanelMetrics', () => {
    it('keeps project sessions detached as a floating panel on phones', () => {
        expect(buildProjectSessionsPanelMetrics({
            width: 390,
            height: 844,
            insets: {
                top: 47,
                bottom: 34,
            },
            isLargeLayout: false,
        })).toMatchObject({
            width: 366,
            marginTop: 59,
            marginBottom: 46,
            borderRadius: 28,
        });
    });
});
