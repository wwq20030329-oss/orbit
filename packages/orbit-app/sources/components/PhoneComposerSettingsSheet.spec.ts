import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Animated: {
        Value: class {},
    },
    Easing: {
        quad: {},
        out: (value: unknown) => value,
        in: (value: unknown) => value,
    },
    InteractionManager: {
        runAfterInteractions: () => ({ cancel: () => {} }),
    },
    Pressable: () => null,
    View: () => null,
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
    useUnistyles: () => ({ theme: {} }),
}));

vi.mock('@/components/StyledText', () => ({
    Text: () => null,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

import {
    buildPhoneComposerSettingsSkeletonPlan,
    shouldDeferPhoneComposerSettingsContent,
} from './PhoneComposerSettingsSheet';

describe('buildPhoneComposerSettingsSkeletonPlan', () => {
    it('keeps one placeholder row for an empty sheet', () => {
        expect(buildPhoneComposerSettingsSkeletonPlan(0)).toEqual({
            rowCount: 1,
            minHeight: 132,
        });
    });

    it('scales the placeholder height with item count', () => {
        expect(buildPhoneComposerSettingsSkeletonPlan(4)).toEqual({
            rowCount: 4,
            minHeight: 264,
        });
    });
});

describe('shouldDeferPhoneComposerSettingsContent', () => {
    it('keeps the first open deferred and later opens warm', () => {
        expect(shouldDeferPhoneComposerSettingsContent(false)).toBe(true);
        expect(shouldDeferPhoneComposerSettingsContent(true)).toBe(false);
    });
});
