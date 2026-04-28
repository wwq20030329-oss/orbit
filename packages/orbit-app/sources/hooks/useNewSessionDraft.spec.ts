import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => {
        unmount: () => void;
    };
};

vi.mock('react-native', () => ({
    InteractionManager: {
        runAfterInteractions: vi.fn(() => ({
            cancel: vi.fn(),
        })),
    },
}));

vi.mock('@/sync/persistence', () => ({
    loadNewSessionDraft: vi.fn(() => null),
    saveNewSessionDraft: vi.fn(),
}));

import {
    useNewSessionDraft,
    useNewSessionDraftActions,
    useNewSessionDraftInput,
    useNewSessionDraftValues,
} from './useNewSessionDraft';

const defaultDraftState = {
    input: '',
    selectedMachineId: null,
    selectedPath: null,
    agentType: 'claude' as const,
    permissionMode: 'default' as const,
    modelMode: 'default',
    sessionType: 'simple' as const,
};

describe('useNewSessionDraft selectors', () => {
    beforeEach(() => {
        useNewSessionDraft.setState(defaultDraftState);
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('keeps the values selector stable when only draft input changes', () => {
        let renderCount = 0;
        let renderer!: { unmount: () => void };

        function Probe() {
            useNewSessionDraftValues();
            renderCount += 1;
            return null;
        }

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });
        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setInput('hello');
        });

        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setMachineId('machine-2');
        });

        expect(renderCount).toBe(2);
        TestRenderer.act(() => {
            renderer.unmount();
        });
    });

    it('keeps the actions selector stable when draft values change', () => {
        let renderCount = 0;
        let renderer!: { unmount: () => void };

        function Probe() {
            useNewSessionDraftActions();
            renderCount += 1;
            return null;
        }

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });
        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setInput('hello');
        });

        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setModelMode('fast');
        });

        expect(renderCount).toBe(1);
        TestRenderer.act(() => {
            renderer.unmount();
        });
    });

    it('keeps the input selector stable when unrelated draft values change', () => {
        let renderCount = 0;
        let renderer!: { unmount: () => void };

        function Probe() {
            useNewSessionDraftInput();
            renderCount += 1;
            return null;
        }

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });
        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setMachineId('machine-2');
        });

        expect(renderCount).toBe(1);

        TestRenderer.act(() => {
            useNewSessionDraft.getState().setInput('hello');
        });

        expect(renderCount).toBe(2);
        TestRenderer.act(() => {
            renderer.unmount();
        });
    });
});
