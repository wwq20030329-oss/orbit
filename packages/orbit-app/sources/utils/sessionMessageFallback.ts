import type { Session } from '@/sync/storageTypes';
import type { Message } from '@/sync/typesMessage';
import { isSessionLikelyOnline } from './presence';
import { getNativeCliSessionTarget } from './nativeCliSessionResolver';

type SessionMessagesState = Record<string, { messages?: Message[]; isLoaded?: boolean } | undefined>;

function compareFallbackCandidates(current: Session, left: Session, right: Session): number {
    const currentTarget = getNativeCliSessionTarget(current);
    const leftTarget = getNativeCliSessionTarget(left);
    const rightTarget = getNativeCliSessionTarget(right);

    const leftSameMachine = currentTarget && leftTarget && leftTarget.machineId === currentTarget.machineId;
    const rightSameMachine = currentTarget && rightTarget && rightTarget.machineId === currentTarget.machineId;
    if (leftSameMachine !== rightSameMachine) {
        return leftSameMachine ? -1 : 1;
    }

    const leftSamePath = left.metadata?.path && current.metadata?.path && left.metadata.path === current.metadata.path;
    const rightSamePath = right.metadata?.path && current.metadata?.path && right.metadata.path === current.metadata.path;
    if (leftSamePath !== rightSamePath) {
        return leftSamePath ? -1 : 1;
    }

    const leftOnline = isSessionLikelyOnline(left);
    const rightOnline = isSessionLikelyOnline(right);
    if (leftOnline !== rightOnline) {
        return leftOnline ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.id.localeCompare(right.id);
}

export function findFallbackSessionMessages(params: {
    currentSession: Session;
    currentSessionId: string;
    sessions: Record<string, Session>;
    sessionMessages: SessionMessagesState;
}): Message[] {
    const target = getNativeCliSessionTarget(params.currentSession);
    if (!target) {
        return [];
    }

    const candidates = Object.values(params.sessions)
        .filter((candidate) => {
            if (candidate.id === params.currentSessionId) {
                return false;
            }

            const candidateTarget = getNativeCliSessionTarget(candidate);
            if (!candidateTarget) {
                return false;
            }

            if (candidateTarget.tool !== target.tool || candidateTarget.backendId !== target.backendId) {
                return false;
            }

            const loadedMessages = params.sessionMessages[candidate.id];
            return Boolean(loadedMessages?.isLoaded && (loadedMessages.messages?.length ?? 0) > 0);
        })
        .sort((left, right) => compareFallbackCandidates(params.currentSession, left, right));

    const sourceSessionId = candidates[0]?.id;
    if (!sourceSessionId) {
        return [];
    }

    return params.sessionMessages[sourceSessionId]?.messages ?? [];
}
