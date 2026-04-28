import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
    Stack: () => null,
}));

vi.mock('react-native-reanimated', () => ({}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/components/navigation/Header', () => ({
    createHeader: () => null,
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

vi.mock('@/utils/platform', () => ({
    isRunningOnMac: () => false,
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                surface: '#fff',
                header: {
                    background: '#fff',
                    tint: '#111',
                },
            },
        },
    }),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import { buildFloatingModalScreenOptions } from '../../app/(app)/_layout';

describe('buildFloatingModalScreenOptions', () => {
    it('presents floating routes over transparent content', () => {
        expect(buildFloatingModalScreenOptions()).toEqual({
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: {
                backgroundColor: 'transparent',
            },
        });
    });
});
