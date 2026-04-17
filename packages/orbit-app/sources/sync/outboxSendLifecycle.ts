import type { AppStateStatus } from 'react-native';

type PendingOutboxMap<T> = Map<string, T[]>;

type ShouldStartBackgroundSendWatchdogArgs = {
    appState: AppStateStatus;
    hasPendingMessages: boolean;
    hasWatchdog: boolean;
    isWeb: boolean;
};

type DidBackgroundSendTimeoutExpireOnResumeArgs = {
    backgroundSendStartedAt: number | null;
    hasPendingMessages: boolean;
    now: number;
    timeoutMs: number;
};

type BackgroundSendWatchdogDispositionArgs = {
    appState: AppStateStatus;
    hasPendingMessages: boolean;
};

export function hasPendingOutboxMessages<T>(
    sendAbortControllers: Map<string, AbortController>,
    pendingOutbox: PendingOutboxMap<T>,
): boolean {
    if (sendAbortControllers.size > 0) {
        return true;
    }

    for (const messages of pendingOutbox.values()) {
        if (messages.length > 0) {
            return true;
        }
    }

    return false;
}

export function shouldStartBackgroundSendWatchdog(
    args: ShouldStartBackgroundSendWatchdogArgs,
): boolean {
    const { appState, hasPendingMessages, hasWatchdog, isWeb } = args;

    return !isWeb && appState !== 'active' && hasPendingMessages && !hasWatchdog;
}

export function didBackgroundSendTimeoutExpireOnResume(
    args: DidBackgroundSendTimeoutExpireOnResumeArgs,
): boolean {
    const { backgroundSendStartedAt, hasPendingMessages, now, timeoutMs } = args;

    return backgroundSendStartedAt !== null
        && hasPendingMessages
        && (now - backgroundSendStartedAt) >= timeoutMs;
}

export function getBackgroundSendWatchdogDisposition(
    args: BackgroundSendWatchdogDispositionArgs,
): 'clear' | 'start' | 'noop' {
    const { appState, hasPendingMessages } = args;

    if (!hasPendingMessages) {
        return 'clear';
    }

    return appState === 'active' ? 'noop' : 'start';
}

export function abortAndDrainPendingOutbox<T>(
    sendAbortControllers: Map<string, AbortController>,
    pendingOutbox: PendingOutboxMap<T>,
): string[] {
    for (const controller of sendAbortControllers.values()) {
        controller.abort();
    }
    sendAbortControllers.clear();

    const sessionIds: string[] = [];
    for (const [sessionId, pending] of pendingOutbox) {
        if (pending.length === 0) {
            continue;
        }
        pending.length = 0;
        pendingOutbox.delete(sessionId);
        sessionIds.push(sessionId);
    }

    return sessionIds;
}
