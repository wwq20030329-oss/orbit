import type {
    LiveMirrorAttachRequest,
    LiveMirrorDetach,
    LiveMirrorRuntimeRef,
} from '@orbit/wire';

import type { Session, SessionLiveRuntimeState } from '@/sync/storageTypes';

type NativeRuntimeTool = 'claude' | 'codex' | 'gemini';
export const LIVE_RUNTIME_SOCKET_DISCONNECT_GRACE_MS = 8_000;

type SessionLiveRuntimeRef = Pick<LiveMirrorRuntimeRef, 'runtimeId' | 'sessionId' | 'machineId'>;

export interface SessionLiveRuntimeTarget extends Pick<LiveMirrorAttachRequest, 'runtimeId' | 'sessionId' | 'machineId'> {
    source: 'orbit-runtime' | 'native-runtime';
}

export function shouldKeepLiveRuntimeStateDuringSocketRecovery(
    status: 'disconnected' | 'connecting' | 'connected' | 'error',
): boolean {
    return status === 'disconnected' || status === 'connecting' || status === 'error';
}

export function shouldDeferLiveRuntimeDetachDuringSocketRecovery(
    reason: LiveMirrorDetach['reason'],
    socketStatus: 'disconnected' | 'connecting' | 'connected' | 'error',
): boolean {
    if (!shouldKeepLiveRuntimeStateDuringSocketRecovery(socketStatus)) {
        return false;
    }

    return reason === 'client-detached' || reason === 'error';
}

type SessionMetadataLike = Session['metadata'];

function trimToNonEmpty(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function buildNativeRuntimeTarget(
    tool: NativeRuntimeTool,
    backendId: string,
    machineId: string,
): SessionLiveRuntimeTarget {
    return {
        source: 'native-runtime',
        runtimeId: `native-runtime:${tool}:${backendId}`,
        sessionId: `native-session:${tool}:${backendId}`,
        machineId,
    };
}

function resolveNativeRuntimeSource(
    metadata: SessionMetadataLike,
): { tool: NativeRuntimeTool; backendId: string } | null {
    const importedTool = metadata?.nativeHistorySourceTool;
    const importedBackendId = trimToNonEmpty(metadata?.nativeHistorySourceBackendId);
    if (
        (importedTool === 'claude' || importedTool === 'codex' || importedTool === 'gemini')
        && importedBackendId
    ) {
        return {
            tool: importedTool,
            backendId: importedBackendId,
        };
    }

    const claudeSessionId = trimToNonEmpty(metadata?.claudeSessionId);
    if (claudeSessionId) {
        return {
            tool: 'claude',
            backendId: claudeSessionId,
        };
    }

    const codexThreadId = trimToNonEmpty(metadata?.codexThreadId);
    if (codexThreadId) {
        return {
            tool: 'codex',
            backendId: codexThreadId,
        };
    }

    const geminiSessionId = trimToNonEmpty(metadata?.geminiSessionId);
    if (geminiSessionId) {
        return {
            tool: 'gemini',
            backendId: geminiSessionId,
        };
    }

    return null;
}

function areRuntimeRefsEqual(left: SessionLiveRuntimeRef, right: SessionLiveRuntimeRef): boolean {
    return left.runtimeId === right.runtimeId
        && left.sessionId === right.sessionId
        && left.machineId === right.machineId;
}

function withUpdatedMatchingSessions(
    sessions: Record<string, Session>,
    runtime: SessionLiveRuntimeRef,
    updater: (session: Session) => Session,
): Record<string, Session> {
    let updatedSessions: Record<string, Session> | null = null;

    for (const [sessionId, session] of Object.entries(sessions)) {
        if (!isSessionMatchingLiveRuntimeTarget(session, runtime)) {
            continue;
        }

        const updatedSession = updater(session);
        if (updatedSession === session) {
            continue;
        }

        if (!updatedSessions) {
            updatedSessions = { ...sessions };
        }

        updatedSessions[sessionId] = updatedSession;
    }

    return updatedSessions ?? sessions;
}

export function resolveSessionLiveRuntimeTarget(
    session: Pick<Session, 'id' | 'metadata'>,
): SessionLiveRuntimeTarget | null {
    const machineId = trimToNonEmpty(session.metadata?.machineId);
    if (!machineId || !session.metadata) {
        return null;
    }

    const directNativeSource = (
        trimToNonEmpty(session.metadata.claudeSessionId)
        || trimToNonEmpty(session.metadata.codexThreadId)
        || trimToNonEmpty(session.metadata.geminiSessionId)
    );
    if (session.metadata.sessionRole === 'native-live-mirror') {
        const nativeRuntime = resolveNativeRuntimeSource(session.metadata);
        return nativeRuntime
            ? buildNativeRuntimeTarget(nativeRuntime.tool, nativeRuntime.backendId, machineId)
            : null;
    }

    if (directNativeSource) {
        return {
            source: 'orbit-runtime',
            runtimeId: `orbit-runtime:${session.id}`,
            sessionId: session.id,
            machineId,
        };
    }

    const nativeRuntime = resolveNativeRuntimeSource(session.metadata);
    return nativeRuntime
        ? buildNativeRuntimeTarget(nativeRuntime.tool, nativeRuntime.backendId, machineId)
        : null;
}

export function isSessionMatchingLiveRuntimeTarget(
    session: Pick<Session, 'id' | 'metadata'>,
    runtime: SessionLiveRuntimeRef,
): boolean {
    const target = resolveSessionLiveRuntimeTarget(session);
    if (!target) {
        return false;
    }

    return areRuntimeRefsEqual(target, runtime);
}

export function connectSessionsToLiveRuntime(
    sessions: Record<string, Session>,
    runtime: SessionLiveRuntimeRef,
    connectedAt: number,
    lastFrameAt: number | null = null,
): Record<string, Session> {
    return withUpdatedMatchingSessions(sessions, runtime, (session) => {
        const previousState = session.liveRuntime;
        const nextState: SessionLiveRuntimeState = {
            runtimeId: runtime.runtimeId,
            sessionId: runtime.sessionId,
            machineId: runtime.machineId,
            status: 'connected',
            connectedAt,
            lastFrameAt: lastFrameAt ?? previousState?.lastFrameAt ?? null,
            lastDetachAt: null,
            detachReason: null,
        };

        if (
            previousState
            && previousState.runtimeId === nextState.runtimeId
            && previousState.sessionId === nextState.sessionId
            && previousState.machineId === nextState.machineId
            && previousState.status === nextState.status
            && previousState.connectedAt === nextState.connectedAt
            && previousState.lastFrameAt === nextState.lastFrameAt
            && previousState.lastDetachAt === nextState.lastDetachAt
            && previousState.detachReason === nextState.detachReason
        ) {
            return session;
        }

        return {
            ...session,
            liveRuntime: nextState,
        };
    });
}

export function applyLiveRuntimeFrameToSessions(
    sessions: Record<string, Session>,
    runtime: SessionLiveRuntimeRef,
    frameAt: number,
): Record<string, Session> {
    return withUpdatedMatchingSessions(sessions, runtime, (session) => {
        const previousState = session.liveRuntime;
        const nextLastFrameAt = Math.max(previousState?.lastFrameAt ?? 0, frameAt);
        const nextState: SessionLiveRuntimeState = {
            runtimeId: runtime.runtimeId,
            sessionId: runtime.sessionId,
            machineId: runtime.machineId,
            status: 'connected',
            connectedAt: previousState?.connectedAt ?? frameAt,
            lastFrameAt: nextLastFrameAt,
            lastDetachAt: null,
            detachReason: null,
        };

        if (
            previousState
            && previousState.runtimeId === nextState.runtimeId
            && previousState.sessionId === nextState.sessionId
            && previousState.machineId === nextState.machineId
            && previousState.status === nextState.status
            && previousState.connectedAt === nextState.connectedAt
            && previousState.lastFrameAt === nextState.lastFrameAt
            && previousState.lastDetachAt === nextState.lastDetachAt
            && previousState.detachReason === nextState.detachReason
        ) {
            return session;
        }

        return {
            ...session,
            liveRuntime: nextState,
        };
    });
}

export function detachSessionsFromLiveRuntime(
    sessions: Record<string, Session>,
    runtime: SessionLiveRuntimeRef,
    detachedAt: number,
    reason: LiveMirrorDetach['reason'],
): Record<string, Session> {
    return withUpdatedMatchingSessions(sessions, runtime, (session) => {
        const previousState = session.liveRuntime;
        const nextState: SessionLiveRuntimeState = {
            runtimeId: runtime.runtimeId,
            sessionId: runtime.sessionId,
            machineId: runtime.machineId,
            status: 'detached',
            connectedAt: previousState?.connectedAt ?? detachedAt,
            lastFrameAt: previousState?.lastFrameAt ?? null,
            lastDetachAt: detachedAt,
            detachReason: reason,
        };

        if (
            previousState
            && previousState.runtimeId === nextState.runtimeId
            && previousState.sessionId === nextState.sessionId
            && previousState.machineId === nextState.machineId
            && previousState.status === nextState.status
            && previousState.connectedAt === nextState.connectedAt
            && previousState.lastFrameAt === nextState.lastFrameAt
            && previousState.lastDetachAt === nextState.lastDetachAt
            && previousState.detachReason === nextState.detachReason
        ) {
            return session;
        }

        return {
            ...session,
            liveRuntime: nextState,
        };
    });
}

export function detachAllConnectedLiveRuntimeSessions(
    sessions: Record<string, Session>,
    detachedAt: number,
    reason: LiveMirrorDetach['reason'],
): Record<string, Session> {
    let updatedSessions: Record<string, Session> | null = null;

    for (const [sessionId, session] of Object.entries(sessions)) {
        if (session.liveRuntime?.status !== 'connected') {
            continue;
        }

        const nextState: SessionLiveRuntimeState = {
            ...session.liveRuntime,
            status: 'detached',
            lastDetachAt: detachedAt,
            detachReason: reason,
        };

        if (
            session.liveRuntime.status === nextState.status
            && session.liveRuntime.lastDetachAt === nextState.lastDetachAt
            && session.liveRuntime.detachReason === nextState.detachReason
        ) {
            continue;
        }

        if (!updatedSessions) {
            updatedSessions = { ...sessions };
        }

        updatedSessions[sessionId] = {
            ...session,
            liveRuntime: nextState,
        };
    }

    return updatedSessions ?? sessions;
}
