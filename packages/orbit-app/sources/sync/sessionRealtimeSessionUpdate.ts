import type {
    ApiDeleteSession,
    ApiUpdateContainer,
    ApiUpdateNewSession,
    ApiUpdateSessionState,
} from './apiTypes';
import type { Session } from './storageTypes';

type SessionPresence = 'online' | number;
type DecryptedSession = Omit<Session, 'presence'> & { presence?: SessionPresence };

type NewSessionUpdate = ApiUpdateContainer & { body: ApiUpdateNewSession };
type DeleteSessionUpdate = ApiUpdateContainer & { body: ApiDeleteSession };
type UpdateSessionStateUpdate = ApiUpdateContainer & { body: ApiUpdateSessionState };

type SessionEncryptionLike = {
    decryptAgentState: (version: number, value: string | null) => Promise<Session['agentState']>;
    decryptMetadata: (version: number, value: string) => Promise<Session['metadata']>;
};

export type SessionRealtimeUpdateDependencies = {
    decryptSessions: (sessions: ApiUpdateNewSession[]) => Promise<DecryptedSession[]>;
    applySessions: (sessions: Session[]) => void;
    invalidateSessions: () => void;
    getSession: (sessionId: string) => Session | undefined;
    getSessionEncryption: (sessionId: string) => SessionEncryptionLike | null;
    isSessionVisible: (sessionId: string) => boolean;
    invalidateMessages: (sessionId: string) => void;
    invalidateGitStatus: (sessionId: string) => void;
    rememberDeletedSessionHints: (session: Session) => void;
    deleteSession: (sessionId: string) => void;
    removeSessionEncryption: (sessionId: string) => void;
    removeProjectSession: (sessionId: string) => void;
    clearGitStatus: (sessionId: string) => void;
    clearSessionCaches: (sessionId: string) => void;
    onPermissionRequested: (sessionId: string, requestId: string, toolName?: string, args?: unknown) => void;
    onMissingSessionEncryption?: (sessionId: string) => void;
    didSessionControlReturnToApp: (previous: Session['agentState'], next: Session['agentState']) => boolean;
};

export async function handleRealtimeNewSessionUpdate(
    update: NewSessionUpdate,
    deps: SessionRealtimeUpdateDependencies,
): Promise<void> {
    try {
        const decryptedSessions = await deps.decryptSessions([update.body]);
        if (decryptedSessions.length > 0) {
            deps.applySessions(decryptedSessions as Session[]);
        } else {
            deps.invalidateSessions();
        }
    } catch {
        deps.invalidateSessions();
    }
}

export function handleRealtimeDeleteSessionUpdate(
    update: DeleteSessionUpdate,
    deps: SessionRealtimeUpdateDependencies,
): void {
    const sessionId = update.body.sid;
    const deletedSession = deps.getSession(sessionId);

    if (deletedSession) {
        deps.rememberDeletedSessionHints(deletedSession);
    }

    deps.deleteSession(sessionId);
    deps.removeSessionEncryption(sessionId);
    deps.removeProjectSession(sessionId);
    deps.clearGitStatus(sessionId);
    deps.clearSessionCaches(sessionId);
}

export async function handleRealtimeUpdateSessionState(
    update: UpdateSessionStateUpdate,
    deps: SessionRealtimeUpdateDependencies,
): Promise<void> {
    const session = deps.getSession(update.body.id);
    if (!session) {
        return;
    }

    const sessionEncryption = deps.getSessionEncryption(update.body.id);
    if (!sessionEncryption) {
        deps.onMissingSessionEncryption?.(update.body.id);
        return;
    }

    const agentState = update.body.agentState
        ? await sessionEncryption.decryptAgentState(update.body.agentState.version, update.body.agentState.value)
        : session.agentState;
    const metadata = update.body.metadata
        ? await sessionEncryption.decryptMetadata(update.body.metadata.version, update.body.metadata.value)
        : session.metadata;

    deps.applySessions([{
        ...session,
        agentState,
        agentStateVersion: update.body.agentState
            ? update.body.agentState.version
            : session.agentStateVersion,
        metadata,
        metadataVersion: update.body.metadata
            ? update.body.metadata.version
            : session.metadataVersion,
        updatedAt: update.createdAt,
        seq: update.seq,
    }]);

    if (!update.body.agentState) {
        return;
    }

    deps.invalidateGitStatus(update.body.id);

    if (agentState?.requests && Object.keys(agentState.requests).length > 0) {
        const requestIds = Object.keys(agentState.requests);
        const firstRequest = agentState.requests[requestIds[0]];
        const firstRequestId = requestIds[0];
        if (firstRequestId) {
            deps.onPermissionRequested(update.body.id, firstRequestId, firstRequest?.tool, firstRequest?.arguments);
        }
    }

    if (deps.didSessionControlReturnToApp(session.agentState, agentState) && deps.isSessionVisible(update.body.id)) {
        deps.invalidateMessages(update.body.id);
    }
}
