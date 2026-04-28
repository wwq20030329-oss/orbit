import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Animated: {
        Value: class {},
    },
    Easing: {
        cubic: {},
        out: (value: unknown) => value,
        inOut: (value: unknown) => value,
    },
    InteractionManager: {
        runAfterInteractions: () => ({ cancel: () => {} }),
    },
    Pressable: () => null,
    View: () => null,
    useWindowDimensions: () => ({ width: 375, height: 812 }),
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ back: () => {}, replace: () => {} }),
}));

vi.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ canGoBack: () => false }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: {
        glyphMap: {},
    },
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: () => ({}),
        hairlineWidth: 1,
        absoluteFillObject: {},
    },
    useUnistyles: () => ({ theme: { colors: {} } }),
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('./SettingsView', () => ({
    SettingsView: () => null,
}));

vi.mock('@/components/StyledText', () => ({
    Text: () => null,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('./layout', () => ({
    layout: {
        maxWidth: 480,
    },
}));

vi.mock('@/utils/closeNearestDrawer', () => ({
    closeNearestDrawer: () => {},
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import {
    buildFloatingSettingsSkeletonPlan,
    buildFloatingSettingsPanelMetrics,
    shouldDeferFloatingSettingsContent,
} from './SettingsViewWrapper';

describe('buildFloatingSettingsSkeletonPlan', () => {
    it('uses a denser skeleton on larger layouts', () => {
        expect(buildFloatingSettingsSkeletonPlan(true)).toEqual({
            summaryLines: 3,
            quickAccessRows: 4,
            connectionRows: 3,
        });
    });

    it('keeps the mobile skeleton compact', () => {
        expect(buildFloatingSettingsSkeletonPlan(false)).toEqual({
            summaryLines: 2,
            quickAccessRows: 3,
            connectionRows: 3,
        });
    });
});

describe('buildFloatingSettingsPanelMetrics', () => {
    it('keeps phone settings detached from every screen edge', () => {
        expect(buildFloatingSettingsPanelMetrics({
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

    it('centers large settings as a floating dialog', () => {
        expect(buildFloatingSettingsPanelMetrics({
            width: 1024,
            height: 768,
            insets: {
                top: 24,
                bottom: 20,
            },
            isLargeLayout: true,
        })).toMatchObject({
            width: 480,
            marginTop: 48,
            marginBottom: 44,
            borderRadius: 28,
        });
    });
});

describe('shouldDeferFloatingSettingsContent', () => {
    it('defers the first floating settings paint until the shell is warmed', () => {
        expect(shouldDeferFloatingSettingsContent()).toBe(true);
    });
});
