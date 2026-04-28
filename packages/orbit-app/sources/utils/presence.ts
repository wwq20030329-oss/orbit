export const LIVE_ACTIVITY_GRACE_MS = 90_000;
export const LIVE_MACHINE_GRACE_MS = 5 * 60_000;
export const NATIVE_DAEMON_SESSION_GRACE_MS = 30_000;

type SessionLike = {
    active: boolean;
    activeAt: number;
    presence?: "online" | number;
    updatedAt?: number;
    liveRuntime?: {
        status?: 'connected' | 'detached' | null;
    } | null;
    metadata?: {
        lifecycleState?: string | null;
        claudeSessionId?: string | null;
        codexThreadId?: string | null;
        geminiSessionId?: string | null;
        nativeHistorySourceTool?: string | null;
        nativeHistorySourceBackendId?: string | null;
        startedBy?: string | null;
        startedFromDaemon?: boolean | null;
        sessionRole?: string | null;
        flavor?: string | null;
    } | null;
};

function isNativeCliFlavorSession(session: SessionLike): boolean {
    const flavor = session.metadata?.flavor;
    return flavor === 'claude' || flavor === 'codex' || flavor === 'gemini';
}

function hasNativeCliBackend(session: SessionLike): boolean {
    return Boolean(
        session.metadata?.claudeSessionId
        || session.metadata?.codexThreadId
        || session.metadata?.geminiSessionId
        || (session.metadata?.nativeHistorySourceTool && session.metadata?.nativeHistorySourceBackendId),
    );
}

function isImportedNativeHistoryWrapper(session: SessionLike): boolean {
    if (!session.metadata?.nativeHistorySourceTool || !session.metadata?.nativeHistorySourceBackendId) {
        return false;
    }

    return !session.metadata?.claudeSessionId
        && !session.metadata?.codexThreadId
        && !session.metadata?.geminiSessionId;
}

function isRecentlyStartedDaemonNativeSession(
    session: SessionLike,
    now: number = Date.now(),
): boolean {
    if (!hasNativeCliBackend(session) || !session.metadata) {
        return false;
    }

    if (session.metadata.lifecycleState !== 'running') {
        return false;
    }

    const startedByDaemon = session.metadata.startedBy === 'daemon' || session.metadata.startedFromDaemon === true;
    if (!startedByDaemon) {
        return false;
    }

    const updatedAt = session.updatedAt;
    if (!Number.isFinite(updatedAt) || !updatedAt || updatedAt <= 0) {
        return false;
    }

    return now - updatedAt <= NATIVE_DAEMON_SESSION_GRACE_MS;
}

function shouldTrustPersistedOnlinePresence(
    session: SessionLike,
    now: number = Date.now(),
): boolean {
    if (isImportedNativeHistoryWrapper(session)) {
        return false;
    }

    if (!hasNativeCliBackend(session)) {
        if (isNativeCliFlavorSession(session)) {
            return isSessionPresenceOnline(session, now);
        }

        return true;
    }

    return isSessionPresenceOnline(session, now) || isRecentlyStartedDaemonNativeSession(session, now);
}

export function isRecentlyActive(activeAt: number, now: number = Date.now(), graceMs: number = LIVE_ACTIVITY_GRACE_MS): boolean {
    if (!Number.isFinite(activeAt) || activeAt <= 0) {
        return false;
    }

    return now - activeAt <= graceMs;
}

export function isSessionPresenceOnline(
    session: SessionLike,
    now: number = Date.now(),
): boolean {
    return session.active && isRecentlyActive(session.activeAt, now);
}

export function isSessionLikelyOnline(
    session: SessionLike,
    now: number = Date.now(),
): boolean {
    if (session.metadata?.sessionRole === 'native-live-mirror') {
        return false;
    }

    if (session.liveRuntime?.status === 'connected') {
        return true;
    }

    if (session.presence === 'online') {
        return shouldTrustPersistedOnlinePresence(session, now);
    }

    if (isSessionPresenceOnline(session, now)) {
        return true;
    }

    if (!session.metadata) {
        return false;
    }

    if (hasNativeCliBackend(session)) {
        return isRecentlyStartedDaemonNativeSession(session, now);
    }

    if (isNativeCliFlavorSession(session)) {
        return false;
    }

    return session.metadata?.lifecycleState === 'running';
}

export function resolveSessionPresence(
    session: SessionLike,
    now: number = Date.now(),
): "online" | number {
    return isSessionLikelyOnline(session, now) ? "online" : session.activeAt;
}

export function isMachinePresenceOnline(
    machine: { active: boolean; activeAt: number },
    now: number = Date.now(),
): boolean {
    return machine.active && isRecentlyActive(machine.activeAt, now, LIVE_MACHINE_GRACE_MS);
}
