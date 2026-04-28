import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import { storage } from '@/sync/storage';
import type { PhoneCliTool } from '@/utils/phoneCli';
import { getDeviceType } from '@/utils/responsive';

type PendingSeedOptions = {
    optimisticPendingUserMessage?: string | null;
    optimisticCli?: PhoneCliTool | null;
};

function normalizePendingMessage(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function shouldUsePhoneWorkspaceNavigation(): boolean {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return false;
    }

    return getDeviceType() === 'phone';
}

export function rememberLastOpenedSessionIdentifier(identifier: string) {
    storage.getState().applyLocalSettings({
        lastOpenedSessionIdentifier: identifier,
    });
}

export function activatePhoneWorkspaceSession(
    sessionId: string,
    options: PendingSeedOptions = {},
) {
    rememberLastOpenedSessionIdentifier(sessionId);

    if (options.optimisticCli || options.optimisticPendingUserMessage !== undefined) {
        storage.getState().setPendingPhoneConversationSeed(sessionId, {
            optimisticPendingUserMessage: normalizePendingMessage(options.optimisticPendingUserMessage),
            optimisticCli: options.optimisticCli ?? null,
        });
    }

    storage.getState().setPhoneWorkspaceSessionId(sessionId);
}

export function clearPhoneWorkspaceSession() {
    storage.getState().setPhoneWorkspaceSessionId(null);
}

export function navigateToPhoneWorkspaceSession(
    router: Router,
    sessionId: string,
    options: PendingSeedOptions = {},
) {
    activatePhoneWorkspaceSession(sessionId, options);
    router.navigate('/');
}

export function replaceToPhoneWorkspaceSession(
    router: Router,
    sessionId: string,
    options: PendingSeedOptions = {},
) {
    activatePhoneWorkspaceSession(sessionId, options);
    router.replace('/');
}

export function navigateToPhoneWorkspaceHome(router: Router) {
    clearPhoneWorkspaceSession();
    router.navigate('/');
}

export function replaceToPhoneWorkspaceHome(router: Router) {
    clearPhoneWorkspaceSession();
    router.replace('/');
}
