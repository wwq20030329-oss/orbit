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
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: {
        glyphMap: {},
    },
}));

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: () => ({}),
        hairlineWidth: 1,
        absoluteFillObject: {},
    },
    useUnistyles: () => ({ theme: {} }),
}));

vi.mock('@/components/layout', () => ({
    layout: {
        maxWidth: 320,
    },
}));

vi.mock('@/components/StyledText', () => ({
    Text: () => null,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/utils/phoneCli', () => ({
    getPhoneCliIcon: () => 'code-slash-outline',
    getPhoneCliLabel: (tool: string) => tool,
}));

import {
    buildPhoneCliPickerSkeletonPlan,
    shouldDeferPhoneCliPickerContent,
} from './PhoneCliPickerSheet';

describe('buildPhoneCliPickerSkeletonPlan', () => {
    it('uses section rows when a config section is active', () => {
        const plan = buildPhoneCliPickerSkeletonPlan({
            currentSection: {
                key: 'model',
                title: 'Model',
                selectedKey: null,
                options: [
                    { key: 'a', label: 'Alpha' },
                    { key: 'b', label: 'Beta' },
                ],
                onSelect: () => {},
            },
            availableTools: ['claude', 'codex'],
            configItems: [],
            showToolSection: true,
        });

        expect(plan.mode).toBe('section');
        expect(plan.sectionRowCount).toBe(2);
        expect(plan.toolRowCount).toBe(0);
        expect(plan.configRowCount).toBe(0);
    });

    it('uses overview counts when no section is active', () => {
        const plan = buildPhoneCliPickerSkeletonPlan({
            currentSection: null,
            availableTools: ['claude', 'codex', 'gemini'],
            configItems: [
                { key: 'model', label: 'Model', value: 'Claude', icon: 'code-slash-outline' },
            ],
            showToolSection: true,
        });

        expect(plan.mode).toBe('overview');
        expect(plan.toolRowCount).toBe(3);
        expect(plan.configRowCount).toBe(1);
        expect(plan.sectionRowCount).toBe(0);
    });

    it('hides tool placeholders when the tool section is disabled', () => {
        const plan = buildPhoneCliPickerSkeletonPlan({
            currentSection: null,
            availableTools: ['claude', 'codex'],
            configItems: [],
            showToolSection: false,
        });

        expect(plan.toolRowCount).toBe(0);
        expect(plan.configRowCount).toBe(0);
    });
});

describe('shouldDeferPhoneCliPickerContent', () => {
    it('defers content until first warm mount only', () => {
        expect(shouldDeferPhoneCliPickerContent(false)).toBe(true);
        expect(shouldDeferPhoneCliPickerContent(true)).toBe(false);
    });
});
