import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
    return {};
});

const TestRenderer = require('react-test-renderer');

type ReactTestRendererLike = {
    update: (element: React.ReactElement) => void;
    unmount: () => void;
};

type CapturedAutocompleteProps = {
    suggestions?: unknown;
};

const hoisted = vi.hoisted(() => ({
    useSetting: vi.fn(() => false),
}));

const autocompleteProps: CapturedAutocompleteProps[] = [];
const sharedSuggestions = [
    [
        { key: 'one', text: 'one', component: () => null },
        { key: 'two', text: 'two', component: () => null },
    ],
    0,
    vi.fn(),
    vi.fn(),
];

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
    Octicons: () => null,
}));

vi.mock('expo-image', () => ({
    Image: () => null,
}));

vi.mock('react-native', () => ({
    ActivityIndicator: () => null,
    Image: () => null,
    Platform: {
        OS: 'ios',
        select: (options: Record<string, unknown>) => options.default,
    },
    Pressable: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Text: ({ children }: { children?: React.ReactNode }) => children ?? null,
    TouchableWithoutFeedback: ({ children }: { children?: React.ReactNode }) => children ?? null,
    View: ({ children }: { children?: React.ReactNode }) => children ?? null,
    useWindowDimensions: () => ({ width: 800, height: 600 }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        hairlineWidth: 1,
        create: (factory: any) => factory({
            colors: {
                button: {
                    secondary: { tint: '#111' },
                    primary: { background: '#000', tint: '#fff', disabled: '#ddd' },
                },
                textSecondary: '#666',
                text: '#111',
                surfacePressed: '#f0f0f0',
                divider: '#ddd',
                radio: { active: '#000', inactive: '#999', dot: '#000' },
                warningCritical: '#d00',
                warning: '#e60',
                input: { background: '#fff' },
                groupped: { background: '#f4f4f4' },
                surfaceHigh: '#fafafa',
                textDestructive: '#f00',
                success: '#090',
                permission: {
                    acceptEdits: '#0f0',
                    bypass: '#00f',
                    plan: '#123',
                    readOnly: '#456',
                    safeYolo: '#789',
                    yolo: '#abc',
                },
            },
        }),
    },
    useUnistyles: () => ({ theme: {
        colors: {
            button: {
                secondary: { tint: '#111' },
                primary: { background: '#000', tint: '#fff', disabled: '#ddd' },
            },
            textSecondary: '#666',
            text: '#111',
            surfacePressed: '#f0f0f0',
            divider: '#ddd',
            radio: { active: '#000', inactive: '#999', dot: '#000' },
            warningCritical: '#d00',
            warning: '#e60',
            input: { background: '#fff' },
            groupped: { background: '#f4f4f4' },
            surfaceHigh: '#fafafa',
            textDestructive: '#f00',
            success: '#090',
            permission: {
                acceptEdits: '#0f0',
                bypass: '#00f',
                plan: '#123',
                readOnly: '#456',
                safeYolo: '#789',
                yolo: '#abc',
            },
        },
    } }),
}));

vi.mock('./autocomplete/useActiveWord', () => ({
    useActiveWord: () => 'active-word',
}));

vi.mock('./autocomplete/useActiveSuggestions', () => ({
    useActiveSuggestions: () => sharedSuggestions,
}));

vi.mock('./AgentInputAutocomplete', () => ({
    AgentInputAutocomplete: (props: CapturedAutocompleteProps) => {
        autocompleteProps.push(props);
        return null;
    },
}));

vi.mock('./FloatingOverlay', () => ({
    FloatingOverlay: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('./GitStatusBadge', () => ({
    GitStatusBadge: () => null,
    hasRenderableGitStatus: () => false,
}));

vi.mock('./MultiTextInput', () => ({
    MultiTextInput: () => null,
}));

vi.mock('./Shaker', () => ({
    Shaker: () => null,
}));

vi.mock('./StatusDot', () => ({
    StatusDot: () => null,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/sync/storage', () => ({
    useSetting: hoisted.useSetting,
}));

vi.mock('@/sync/modeHacks', () => ({
    hackMode: () => null,
    hackModes: (modes: unknown[]) => modes,
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('./haptics', () => ({
    hapticsError: vi.fn(),
    hapticsLight: vi.fn(),
}));

vi.mock('./autocomplete/applySuggestion', () => ({
    applySuggestion: vi.fn(),
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: vi.fn(),
    },
}));

vi.mock('./layout', () => ({
    layout: { maxWidth: 360 },
}));

import { AgentInput } from './AgentInput';

describe('AgentInput', () => {
    it('skips the persisted enter-to-send subscription when the prop is controlled', () => {
        hoisted.useSetting.mockClear();

        const props = {
            value: '',
            placeholder: 'Type here',
            onChangeText: vi.fn(),
            onSend: vi.fn(),
            autocompletePrefixes: ['/'],
            autocompleteSuggestions: vi.fn(),
            enterToSendEnabled: true,
        };

        let renderer!: ReactTestRendererLike;

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(AgentInput, props));
        });

        expect(hoisted.useSetting).not.toHaveBeenCalled();

        TestRenderer.act(() => {
            renderer.unmount();
        });
    });

    it('falls back to the persisted enter-to-send setting when the prop is unset', () => {
        hoisted.useSetting.mockClear();

        let renderer!: ReactTestRendererLike;

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(AgentInput, {
                value: '',
                placeholder: 'Type here',
                onChangeText: vi.fn(),
                onSend: vi.fn(),
                autocompletePrefixes: ['/'],
                autocompleteSuggestions: vi.fn(),
            }));
        });

        expect(hoisted.useSetting).toHaveBeenCalledWith('agentInputEnterToSend');

        TestRenderer.act(() => {
            renderer.unmount();
        });
    });

    it('keeps autocomplete nodes stable across unrelated prop changes', () => {
        autocompleteProps.length = 0;
        hoisted.useSetting.mockClear();

        const baseProps = {
            value: '',
            placeholder: 'Type here',
            onChangeText: vi.fn(),
            onSend: vi.fn(),
            autocompletePrefixes: ['/'],
            autocompleteSuggestions: vi.fn(),
        };

        let renderer: ReactTestRendererLike;

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(AgentInput, baseProps));
        });

        const firstProps = autocompleteProps[autocompleteProps.length - 1];

        TestRenderer.act(() => {
            renderer.update(React.createElement(AgentInput, {
                ...baseProps,
                placeholder: 'Still typing',
            }));
        });

        const secondProps = autocompleteProps[autocompleteProps.length - 1];

        expect(secondProps.suggestions).toBe(firstProps.suggestions);

        TestRenderer.act(() => {
            renderer.unmount();
        });
    });
});
