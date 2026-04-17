import type { Session } from './storageTypes';
import type { SessionControlState } from '@/utils/sessionControlState';

export const VISIBLE_SESSION_MESSAGES_REFRESH_COOLDOWN_MS = 3_000;
export const VISIBLE_SESSION_STATE_REFRESH_COOLDOWN_MS = 12_000;

function hasDirectNativeRuntime(session: Session): boolean {
    return Boolean(
        session.metadata?.claudeSessionId
        || session.metadata?.codexThreadId
        || session.metadata?.geminiSessionId,
    );
}

export function shouldRefreshVisibleSessionMessages(params: {
    loadedCount: number;
    lastRefreshedAt: number | null | undefined;
    now?: number;
}): boolean {
    const { loadedCount, lastRefreshedAt, now = Date.now() } = params;

    if (loadedCount === 0) {
        return true;
    }

    if (!lastRefreshedAt) {
        return true;
    }

    return (now - lastRefreshedAt) >= VISIBLE_SESSION_MESSAGES_REFRESH_COOLDOWN_MS;
}

export function shouldRefreshSessionsOnVisible(
    session: Session | null | undefined,
    sessionControlState: SessionControlState | null | undefined,
    options: {
        lastRefreshedAt?: number | null;
        now?: number;
    } = {},
): boolean {
    if (!session || !sessionControlState) {
        return false;
    }

    if (session.metadata?.lifecycleState !== 'running') {
        return false;
    }

    if (!hasDirectNativeRuntime(session)) {
        return false;
    }

    if (!sessionControlState.isDisconnected) {
        return false;
    }

    const { lastRefreshedAt = null, now = Date.now() } = options;
    if (!lastRefreshedAt) {
        return true;
    }

    return (now - lastRefreshedAt) >= VISIBLE_SESSION_STATE_REFRESH_COOLDOWN_MS;
}
