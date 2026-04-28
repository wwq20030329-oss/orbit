import type { GitStatus, Session } from './storageTypes';
import type { GitStatusFiles } from './gitStatusFiles';

type SessionFileCache = Record<string, { content: string | null; diff: string | null; isBinary: boolean; cachedAt: number }>;

export interface DeleteSessionStateInput<TSessionMessages, TPendingSeed> {
    sessions: Record<string, Session>;
    cliListSessions: Session[];
    sessionMessages: Record<string, TSessionMessages>;
    sessionGitStatus: Record<string, GitStatus | null>;
    sessionGitStatusFiles: Record<string, GitStatusFiles | null>;
    sessionFileCache: Record<string, SessionFileCache>;
    pendingPhoneConversationSeeds: Record<string, TPendingSeed>;
    phoneWorkspaceSessionId: string | null;
}

export function deleteSessionState<TSessionMessages, TPendingSeed>(
    state: DeleteSessionStateInput<TSessionMessages, TPendingSeed>,
    sessionId: string,
): DeleteSessionStateInput<TSessionMessages, TPendingSeed> {
    const { [sessionId]: _deletedSession, ...remainingSessions } = state.sessions;
    const { [sessionId]: _deletedMessages, ...remainingSessionMessages } = state.sessionMessages;
    const { [sessionId]: _deletedGitStatus, ...remainingGitStatus } = state.sessionGitStatus;
    const { [sessionId]: _deletedGitStatusFiles, ...remainingGitStatusFiles } = state.sessionGitStatusFiles;
    const { [sessionId]: _deletedFileCache, ...remainingFileCache } = state.sessionFileCache;
    const { [sessionId]: _deletedPendingSeed, ...remainingPendingSeeds } = state.pendingPhoneConversationSeeds;

    return {
        sessions: remainingSessions,
        cliListSessions: state.cliListSessions.filter((session) => session.id !== sessionId),
        sessionMessages: remainingSessionMessages,
        sessionGitStatus: remainingGitStatus,
        sessionGitStatusFiles: remainingGitStatusFiles,
        sessionFileCache: remainingFileCache,
        pendingPhoneConversationSeeds: remainingPendingSeeds,
        phoneWorkspaceSessionId: state.phoneWorkspaceSessionId === sessionId
            ? null
            : state.phoneWorkspaceSessionId,
    };
}
