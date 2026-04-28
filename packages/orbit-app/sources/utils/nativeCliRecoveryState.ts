import {
    loadNativeCliRecoveryIdentifiers,
    loadNativeCliRecoveryResumeRequests,
    saveNativeCliRecoveryIdentifiers,
    saveNativeCliRecoveryResumeRequests,
    type PersistedNativeCliResumeRequest,
} from '@/sync/persistence';

export type ResumeNativeCliSessionRequest = PersistedNativeCliResumeRequest;

const rememberedNativeIdentifiersBySessionId = new Map<string, string>(
    Object.entries(loadNativeCliRecoveryIdentifiers()),
);
const rememberedNativeResumeRequestsBySessionId = new Map<string, ResumeNativeCliSessionRequest>(
    Object.entries(loadNativeCliRecoveryResumeRequests()),
);
const historyOnlyOpenedSessionIds = new Set<string>();

export function rememberNativeSessionIdentifier(sessionId: string, identifier: string): void {
    rememberedNativeIdentifiersBySessionId.set(sessionId, identifier);
    saveNativeCliRecoveryIdentifiers(Object.fromEntries(rememberedNativeIdentifiersBySessionId.entries()));
}

export function getRememberedNativeCliIdentifier(sessionId: string): string | null {
    return rememberedNativeIdentifiersBySessionId.get(sessionId) ?? null;
}

export function rememberNativeResumeRequest(sessionId: string, request: ResumeNativeCliSessionRequest): void {
    rememberedNativeResumeRequestsBySessionId.set(sessionId, request);
    saveNativeCliRecoveryResumeRequests(Object.fromEntries(rememberedNativeResumeRequestsBySessionId.entries()));
}

export function getRememberedNativeCliResumeRequest(sessionId: string): ResumeNativeCliSessionRequest | null {
    return rememberedNativeResumeRequestsBySessionId.get(sessionId) ?? null;
}

export function findRememberedResumeRequestByIdentifier(
    tool: ResumeNativeCliSessionRequest['tool'],
    backendId: string,
): ResumeNativeCliSessionRequest | null {
    const candidates = Array.from(rememberedNativeResumeRequestsBySessionId.values())
        .filter((request) => request.tool === tool && request.backendId === backendId)
        .sort((left, right) => right.updatedAt - left.updatedAt);

    return candidates[0] ?? null;
}

export function markSessionOpenedAsHistoryOnly(sessionId: string): void {
    historyOnlyOpenedSessionIds.add(sessionId);
}

export function clearSessionOpenedAsHistoryOnly(sessionId: string): void {
    historyOnlyOpenedSessionIds.delete(sessionId);
}

export function isSessionOpenedAsHistoryOnly(sessionId: string): boolean {
    return historyOnlyOpenedSessionIds.has(sessionId);
}

export function resetSessionOpenedAsHistoryOnlyForTests(): void {
    historyOnlyOpenedSessionIds.clear();
}
