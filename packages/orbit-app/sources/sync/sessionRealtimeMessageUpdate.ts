import type { ApiMessage, ApiUpdateContainer, ApiUpdateNewMessage } from './apiTypes';
import { getSessionLifecycleState } from './sessionLifecycle';
import type { Session } from './storageTypes';
import { normalizeRawMessage, type NormalizedMessage, type RawRecord } from './typesRaw';

type DecryptedRealtimeMessage = {
    id: string;
    localId: string | null;
    createdAt: number;
    content: RawRecord;
};

type RealtimeMessageEncryption = {
    decryptMessage: (message: ApiMessage) => Promise<DecryptedRealtimeMessage | null>;
};

type NewMessageUpdate = ApiUpdateContainer & { body: ApiUpdateNewMessage };

export type HandleRealtimeMessageUpdateDependencies = {
    isSessionVisible: (sessionId: string) => boolean;
    hasLocalMessageHistory: (sessionId: string) => boolean;
    getSessionEncryption: (sessionId: string) => RealtimeMessageEncryption | null;
    getSession: (sessionId: string) => Session | undefined;
    applySessions: (sessions: Session[]) => void;
    fetchSessions: () => void;
    getLastSeq: (sessionId: string) => number | undefined;
    setLastSeq: (sessionId: string, seq: number) => void;
    enqueueMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
    invalidateMessages: (sessionId: string) => void;
    isMutableToolCall: (sessionId: string, toolUseId: string) => boolean;
    invalidateGitStatus: (sessionId: string) => void;
    onSessionNotReady?: (sessionId: string) => void;
    onLifecycleHint?: (payload: { sessionId: string; isTaskComplete: boolean; isTaskStarted: boolean }) => void;
};

export async function handleRealtimeMessageUpdate(
    update: NewMessageUpdate,
    deps: HandleRealtimeMessageUpdateDependencies,
): Promise<void> {
    const sessionId = update.body.sid;
    const isVisibleSession = deps.isSessionVisible(sessionId);
    const encryption = deps.getSessionEncryption(sessionId);

    if (!encryption) {
        deps.onSessionNotReady?.(sessionId);
        deps.fetchSessions();
        return;
    }

    let lastMessage: NormalizedMessage | null = null;
    let isTaskComplete = false;
    let isTaskStarted = false;

    if (update.body.message) {
        const decrypted = await encryption.decryptMessage(update.body.message);
        if (decrypted) {
            if (isVisibleSession) {
                lastMessage = normalizeRawMessage(
                    decrypted.id,
                    decrypted.localId,
                    decrypted.createdAt,
                    decrypted.content,
                );
            }

            ({ isTaskComplete, isTaskStarted } = getSessionLifecycleState(decrypted.content));
            if (isTaskComplete || isTaskStarted) {
                deps.onLifecycleHint?.({ sessionId, isTaskComplete, isTaskStarted });
            }
        }
    }

    const session = deps.getSession(sessionId);
    if (session) {
        deps.applySessions([{
            ...session,
            updatedAt: update.createdAt,
            seq: update.seq,
            ...(isTaskComplete ? { thinking: false } : {}),
            ...(isTaskStarted ? { thinking: true } : {}),
        }]);
    } else {
        deps.fetchSessions();
    }

    if (!update.body.message) {
        return;
    }

    const hasLocalHistory = deps.hasLocalMessageHistory(sessionId);
    if (!isVisibleSession && !hasLocalHistory) {
        // Drop realtime messages only if we're not looking at this session
        // AND we haven't loaded its history yet. Otherwise, keep accumulating
        // them in the background so the list stays fresh when navigating back.
        return;
    }

    const currentLastSeq = deps.getLastSeq(sessionId);
    const incomingSeq = update.body.message.seq;
    
    // We tolerate gaps now. If incomingSeq is strictly greater, enqueue it 
    // to provide instant UI feedback without a loading spinner. If there's 
    // a gap (e.g. dropped a packet), we silently invalidate and fetch the 
    // missing messages in the background.
    if (lastMessage && currentLastSeq !== undefined && incomingSeq > currentLastSeq) {
        deps.enqueueMessages(sessionId, [lastMessage]);
        deps.setLastSeq(sessionId, incomingSeq);

        if (incomingSeq > currentLastSeq + 1) {
            // Background repair for the gap
            deps.invalidateMessages(sessionId);
        }

        let hasMutableTool = false;
        if (lastMessage.role === 'agent' && lastMessage.content[0]?.type === 'tool-result') {
            hasMutableTool = deps.isMutableToolCall(sessionId, lastMessage.content[0].tool_use_id);
        }
        if (hasMutableTool) {
            deps.invalidateGitStatus(sessionId);
        }
        return;
    }

    if (lastMessage && currentLastSeq === undefined && !hasLocalHistory) {
        deps.enqueueMessages(sessionId, [lastMessage]);
        deps.invalidateMessages(sessionId);
        return;
    }

    if (currentLastSeq !== undefined && incomingSeq <= currentLastSeq) {
        return;
    }

    deps.invalidateMessages(sessionId);
}
