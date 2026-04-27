import type { DecryptedSession } from './api';

type SessionMetadata = Record<string, unknown> | null;

function getMetadata(session: DecryptedSession): SessionMetadata {
    return session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
        ? session.metadata as Record<string, unknown>
        : null;
}

function getContinuationKey(session: DecryptedSession): string | null {
    const metadata = getMetadata(session);
    if (!metadata) {
        return null;
    }

    if (typeof metadata.codexThreadId === 'string' && metadata.codexThreadId.length > 0) {
        return `codex:${metadata.codexThreadId}`;
    }
    if (typeof metadata.claudeSessionId === 'string' && metadata.claudeSessionId.length > 0) {
        return `claude:${metadata.claudeSessionId}`;
    }
    if (typeof metadata.geminiSessionId === 'string' && metadata.geminiSessionId.length > 0) {
        return `gemini:${metadata.geminiSessionId}`;
    }
    if (
        typeof metadata.nativeHistorySourceTool === 'string'
        && typeof metadata.nativeHistorySourceBackendId === 'string'
        && metadata.nativeHistorySourceBackendId.length > 0
    ) {
        return `${metadata.nativeHistorySourceTool}:${metadata.nativeHistorySourceBackendId}`;
    }

    return null;
}

function getDirectContinuationKey(session: DecryptedSession): string | null {
    const metadata = getMetadata(session);
    if (!metadata) {
        return null;
    }

    if (typeof metadata.codexThreadId === 'string' && metadata.codexThreadId.length > 0) {
        return `codex:${metadata.codexThreadId}`;
    }
    if (typeof metadata.claudeSessionId === 'string' && metadata.claudeSessionId.length > 0) {
        return `claude:${metadata.claudeSessionId}`;
    }
    if (typeof metadata.geminiSessionId === 'string' && metadata.geminiSessionId.length > 0) {
        return `gemini:${metadata.geminiSessionId}`;
    }

    return null;
}

function isArchivedSession(session: DecryptedSession): boolean {
    const metadata = getMetadata(session);
    return metadata?.lifecycleState === 'archived';
}

function isOperationalSession(session: DecryptedSession): boolean {
    return session.active && !isArchivedSession(session);
}

function compareContinuationCandidates(
    key: string,
    left: DecryptedSession,
    right: DecryptedSession,
): number {
    const leftDirect = getDirectContinuationKey(left) === key;
    const rightDirect = getDirectContinuationKey(right) === key;
    if (leftDirect !== rightDirect) {
        return leftDirect ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return right.activeAt - left.activeAt;
}

export function resolveOperationalSession(params: {
    requested: DecryptedSession;
    sessions: DecryptedSession[];
}): {
    requested: DecryptedSession;
    resolved: DecryptedSession;
    continued: boolean;
} {
    const { requested, sessions } = params;
    if (isOperationalSession(requested)) {
        return {
            requested,
            resolved: requested,
            continued: false,
        };
    }

    const continuationKey = getContinuationKey(requested);
    if (!continuationKey) {
        return {
            requested,
            resolved: requested,
            continued: false,
        };
    }

    const continuation = sessions
        .filter((session) => session.id !== requested.id)
        .filter(isOperationalSession)
        .filter((session) => getContinuationKey(session) === continuationKey)
        .sort((left, right) => compareContinuationCandidates(continuationKey, left, right))[0];

    return {
        requested,
        resolved: continuation ?? requested,
        continued: continuation != null,
    };
}
