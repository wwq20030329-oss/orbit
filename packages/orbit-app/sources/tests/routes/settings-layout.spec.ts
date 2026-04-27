import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { settingsFrameSpy, stackSpy } = vi.hoisted(() => ({
    settingsFrameSpy: vi.fn(),
    stackSpy: vi.fn(),
}));

vi.mock('expo-router', () => ({
    Stack: Object.assign(
        (props: { children?: React.ReactNode }) => {
            stackSpy(props);
            return null;
        },
        {
            Screen: () => null,
        },
    ),
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#111111',
                groupped: {
                    background: '#f6f6f6',
                },
            },
        },
    }),
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({ fontFamily: 'System' }),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/components/SettingsViewWrapper', () => ({
    SettingsFloatingFrame: (props: { children?: React.ReactNode }) => {
        settingsFrameSpy(props);
        return props.children ?? null;
    },
}));

import {
    buildSettingsIndexScreenOptions,
    buildSettingsStackScreenOptions,
} from '../../app/(app)/settings/_layout';
import SettingsLayout from '../../app/(app)/settings/_layout';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => { unmount: () => void };
};

describe('buildSettingsStackScreenOptions', () => {
    it('freezes inactive settings screens and keeps the grouped background stable', () => {
        expect(buildSettingsStackScreenOptions({
            textColor: '#111111',
            backgroundColor: '#f6f6f6',
        })).toMatchObject({
            headerTintColor: '#111111',
            freezeOnBlur: true,
            animation: 'default',
            contentStyle: {
                backgroundColor: '#f6f6f6',
            },
        });
    });
});

describe('buildSettingsIndexScreenOptions', () => {
    it('uses transparent content without nesting another transparent modal', () => {
        const options = buildSettingsIndexScreenOptions();

        expect(options).toMatchObject({
            headerShown: false,
            freezeOnBlur: true,
            animation: 'none',
            contentStyle: {
                backgroundColor: 'transparent',
            },
        });
        expect('presentation' in options).toBe(false);
    });
});

describe('SettingsLayout', () => {
    it('keeps every settings route inside one floating frame', () => {
        settingsFrameSpy.mockClear();
        stackSpy.mockClear();

        let renderer!: { unmount: () => void };
        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(SettingsLayout));
        });

        expect(settingsFrameSpy).toHaveBeenCalledTimes(1);
        expect(stackSpy).toHaveBeenCalledTimes(1);

        renderer.unmount();
    });
});
