import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
    const state = {
        applyLocalSettings: vi.fn(),
        setPendingPhoneConversationSeed: vi.fn(),
        setPhoneWorkspaceSessionId: vi.fn(),
    };

    return {
        state,
        getDeviceType: vi.fn(),
        platform: {
            OS: 'ios',
        },
    };
});

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => hoisted.state,
    },
}));

vi.mock('@/utils/responsive', () => ({
    getDeviceType: hoisted.getDeviceType,
}));

vi.mock('react-native', () => ({
    Platform: hoisted.platform,
}));

import {
    activatePhoneWorkspaceSession,
    clearPhoneWorkspaceSession,
    replaceToPhoneWorkspaceSession,
    shouldUsePhoneWorkspaceNavigation,
} from './phoneWorkspaceNavigation';

describe('phoneWorkspaceNavigation', () => {
    beforeEach(() => {
        hoisted.state.applyLocalSettings.mockReset();
        hoisted.state.setPendingPhoneConversationSeed.mockReset();
        hoisted.state.setPhoneWorkspaceSessionId.mockReset();
        hoisted.getDeviceType.mockReset();
        hoisted.getDeviceType.mockReturnValue('phone');
        hoisted.platform.OS = 'ios';
    });

    it('detects phone workspace navigation only on mobile phones', () => {
        expect(shouldUsePhoneWorkspaceNavigation()).toBe(true);

        hoisted.getDeviceType.mockReturnValue('tablet');
        expect(shouldUsePhoneWorkspaceNavigation()).toBe(false);

        hoisted.platform.OS = 'web';
        hoisted.getDeviceType.mockReturnValue('phone');
        expect(shouldUsePhoneWorkspaceNavigation()).toBe(false);
    });

    it('activates a phone workspace session with a pending seed', () => {
        activatePhoneWorkspaceSession('session-1', {
            optimisticPendingUserMessage: '  hello world  ',
            optimisticCli: 'codex',
        });

        expect(hoisted.state.applyLocalSettings).toHaveBeenCalledWith({
            lastOpenedSessionIdentifier: 'session-1',
        });
        expect(hoisted.state.setPendingPhoneConversationSeed).toHaveBeenCalledWith('session-1', {
            optimisticPendingUserMessage: 'hello world',
            optimisticCli: 'codex',
        });
        expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith('session-1');
    });

    it('can activate a session without creating a pending seed', () => {
        activatePhoneWorkspaceSession('session-2');

        expect(hoisted.state.applyLocalSettings).toHaveBeenCalledWith({
            lastOpenedSessionIdentifier: 'session-2',
        });
        expect(hoisted.state.setPendingPhoneConversationSeed).not.toHaveBeenCalled();
        expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith('session-2');
    });

    it('replaces to the phone workspace home after activating the target session', () => {
        const router = {
            replace: vi.fn(),
        };

        replaceToPhoneWorkspaceSession(router as never, 'session-3', {
            optimisticPendingUserMessage: null,
            optimisticCli: 'claude',
        });

        expect(hoisted.state.setPendingPhoneConversationSeed).toHaveBeenCalledWith('session-3', {
            optimisticPendingUserMessage: null,
            optimisticCli: 'claude',
        });
        expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith('session-3');
        expect(router.replace).toHaveBeenCalledWith('/');
    });

    it('clears the active phone workspace session', () => {
        clearPhoneWorkspaceSession();

        expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith(null);
    });
});
