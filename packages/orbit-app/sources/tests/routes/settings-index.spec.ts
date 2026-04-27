import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsViewSpy = vi.hoisted(() => vi.fn());

vi.mock('@/components/SettingsView', () => ({
    SettingsView: () => {
        settingsViewSpy();
        return null;
    },
}));

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => { unmount: () => void };
};

import { SettingsIndexScreen } from '../../app/(app)/settings/index';

describe('SettingsIndexScreen', () => {
    beforeEach(() => {
        settingsViewSpy.mockClear();
    });

    it('renders settings content inside the parent floating layout', () => {
        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(SettingsIndexScreen));
        });

        expect(settingsViewSpy).toHaveBeenCalledTimes(1);

        renderer.unmount();
    });
});
