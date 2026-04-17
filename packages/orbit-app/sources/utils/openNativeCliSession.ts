import { machineResumeNativeCliHistory } from '@/sync/ops';
import { storage } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { OrbitError } from '@/utils/errors';
import { isMachineOnline } from '@/utils/machineUtils';
import { isSessionLikelyOnline } from '@/utils/presence';
import {
    findMatchingNativeCliEntryForSession,
    findViewableOrbitSessionIdForNativeEntry,
    findReusableOrbitSessionIdForNativeEntry,
} from '@/utils/nativeCliHistory';
import {
    findNativeCliEntryByIdentifier,
    findNativeCliEntryForSession,
    getNativeCliSessionTarget,
    isExplicitNativeCliIdentifier,
    isImportedNativeHistoryWrapperSession,
} from '@/utils/nativeCliSessionResolver';
import { refreshNativeCliHistoryForMachine } from '@/utils/nativeCliHistoryRefresh';
import {
    clearSessionOpenedAsHistoryOnly,
    findRememberedResumeRequestByIdentifier,
    getRememberedNativeCliIdentifier,
    getRememberedNativeCliResumeRequest,
    isSessionOpenedAsHistoryOnly,
    markSessionOpenedAsHistoryOnly,
    rememberNativeResumeRequest,
    rememberNativeSessionIdentifier,
    resetSessionOpenedAsHistoryOnlyForTests,
    type ResumeNativeCliSessionRequest,
} from '@/utils/nativeCliRecoveryState';

export {
    clearSessionOpenedAsHistoryOnly,
    getRememberedNativeCliIdentifier,
    getRememberedNativeCliResumeRequest,
    isSessionOpenedAsHistoryOnly,
    resetSessionOpenedAsHistoryOnlyForTests,
} from '@/utils/nativeCliRecoveryState';

const SESSION_POLL_ATTEMPTS = 40;
const POLL_DELAY_MS = 250;
const inFlightNativeResumeWarmups = new Map<string, Promise<void>>();
const inFlightNativeIdentifierResolutions = new Map<string, Promise<string | null>>();
const SESSION_ROUTE_SESSION_PREFIX = /^(?:claude|codex|gemini):session:(.+)$/;

function isInternalCliMirrorSession(session: Session | null | undefined): boolean {
    return session?.metadata?.sessionRole === 'native-live-mirror';
}

function findExistingSessionForNativeIdentifier(identifier: string): string | null {
    const onlineSessionId = findOrbitSessionIdForNativeIdentifier(
        identifier,
        storage.getState().sessions,
        { requireOnline: true },
    );
    if (onlineSessionId) {
        return onlineSessionId;
    }

    return findOrbitSessionIdForNativeIdentifier(
        identifier,
        storage.getState().sessions,
        { requireOnline: false },
    );
}

export function resolveExistingCanonicalSessionId(identifier: string): string | null {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return null;
    }

    if (isSessionOpenedAsHistoryOnly(trimmedIdentifier)) {
        return trimmedIdentifier;
    }

    const existingSessionId = findExistingSessionForNativeIdentifier(trimmedIdentifier);
    if (existingSessionId) {
        return existingSessionId;
    }

    const rememberedIdentifier = getRememberedNativeCliIdentifier(trimmedIdentifier);
    if (!rememberedIdentifier) {
        return null;
    }

    return findExistingSessionForNativeIdentifier(rememberedIdentifier);
}

function getNativeCliErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }

    return '';
}

export function isNativeCliResumeUnavailableError(error: unknown): boolean {
    const normalizedMessage = getNativeCliErrorMessage(error).trim().toLowerCase();
    return normalizedMessage.includes('rpcmethodnotavailable')
        || normalizedMessage.includes('rpc method not available')
        || normalizedMessage.includes('method not available')
        || normalizedMessage.includes('native cli resume is unavailable on this machine');
}

export function isNativeCliHistoryUnavailableError(error: unknown): boolean {
    const normalizedMessage = getNativeCliErrorMessage(error).trim().toLowerCase();
    return normalizedMessage.includes('native cli history is unavailable on this machine')
        || normalizedMessage.includes('rpcmethodnotavailable')
        || normalizedMessage.includes('rpc method not available')
        || normalizedMessage.includes('method not available');
}

export function isNativeCliSessionMissingError(error: unknown): boolean {
    const normalizedMessage = getNativeCliErrorMessage(error).trim().toLowerCase();
    return normalizedMessage.includes('this session no longer exists on the connected machine');
}

export async function resolveCanonicalSessionId(identifier: string): Promise<string | null> {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return null;
    }

    if (isSessionOpenedAsHistoryOnly(trimmedIdentifier)) {
        return trimmedIdentifier;
    }

    const existingSessionId = resolveExistingCanonicalSessionId(trimmedIdentifier);
    if (existingSessionId) {
        return existingSessionId;
    }

    const inFlightResolution = getInFlightNativeIdentifierResolution(trimmedIdentifier);
    if (inFlightResolution) {
        return await inFlightResolution;
    }

    const rememberedIdentifier = getRememberedNativeCliIdentifier(trimmedIdentifier);
    const rememberedResumeRequest = getRememberedNativeCliResumeRequest(trimmedIdentifier);
    if (rememberedIdentifier) {
        const rememberedInFlightResolution = getInFlightNativeIdentifierResolution(rememberedIdentifier);
        if (rememberedInFlightResolution) {
            return await rememberedInFlightResolution;
        }
    }
    const shouldRecoverDirectly = Boolean(
        rememberedResumeRequest
        || rememberedIdentifier
        || isExplicitNativeCliIdentifier(trimmedIdentifier)
        || trimmedIdentifier.match(SESSION_ROUTE_SESSION_PREFIX),
    );

    if (!shouldRecoverDirectly) {
        await sync.refreshSessions();

        const refreshedSessionId = findExistingSessionForNativeIdentifier(trimmedIdentifier);
        if (refreshedSessionId) {
            return refreshedSessionId;
        }

        if (rememberedIdentifier) {
            const refreshedRememberedSessionId = findExistingSessionForNativeIdentifier(rememberedIdentifier);
            if (refreshedRememberedSessionId) {
                return refreshedRememberedSessionId;
            }
        }
    }

    if (rememberedResumeRequest) {
        try {
            return await openRememberedNativeCliSession(trimmedIdentifier);
        } catch {
            // Fall through to identifier-based recovery.
        }
    }

    if (rememberedIdentifier) {
        const resolvedRememberedSessionId = await openNativeCliSessionFromIdentifier(rememberedIdentifier);
        if (resolvedRememberedSessionId) {
            return resolvedRememberedSessionId;
        }
    }

    if (isExplicitNativeCliIdentifier(trimmedIdentifier) || trimmedIdentifier.match(SESSION_ROUTE_SESSION_PREFIX)) {
        return openNativeCliSessionFromIdentifier(trimmedIdentifier);
    }

    return null;
}

function buildEntryFromSession(session: Session): NativeCliHistoryEntry | null {
    const target = getResumeMetadataTarget(session);
    const machineId = target?.machineId ?? session.metadata?.machineId ?? null;
    if (!target || !target.workingDirectory || !machineId) {
        return null;
    }

    return {
        id: `${target.tool}:session:${session.id}`,
        tool: target.tool,
        backendId: target.backendId,
        machineId,
        workingDirectory: target.workingDirectory,
        projectRoot: target.projectRoot ?? undefined,
        title: session.metadata?.summary?.text?.trim() || 'Recovered Session',
        summary: session.metadata?.summary?.text?.trim() || null,
        updatedAt: session.updatedAt,
        isLive: isSessionLikelyOnline(session),
    };
}

function findReusableSessionForIdentifier(identifier: string): string | null {
    const existingSessionId = findExistingSessionForNativeIdentifier(identifier);
    if (!existingSessionId) {
        return null;
    }

    if (!isExplicitNativeCliIdentifier(identifier)) {
        return existingSessionId;
    }

    const session = storage.getState().sessions[existingSessionId];
    if (!session) {
        return null;
    }

    const entry = buildEntryFromSession(session);
    if (!entry) {
        return existingSessionId;
    }

    return findReusableOrbitSessionIdForNativeEntry(
        entry,
        storage.getState().sessions,
        storage.getState().sessionMessages,
        { allowOffline: true },
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResumeWarmupKey(sessionId: string, identifier: string): string {
    return `${sessionId}:${identifier}`;
}

function buildNativeIdentifier(tool: NativeCliHistoryEntry['tool'], backendId: string): string {
    return `${tool}:${backendId}`;
}

function getInFlightResolutionKeys(entry: Pick<NativeCliHistoryEntry, 'id' | 'tool' | 'backendId'>): string[] {
    return Array.from(new Set([
        entry.id,
        `${entry.tool}:${entry.backendId}`,
        `native-session:${entry.tool}:${entry.backendId}`,
    ]));
}

function getInFlightNativeIdentifierResolution(identifier: string): Promise<string | null> | null {
    const direct = inFlightNativeIdentifierResolutions.get(identifier);
    if (direct) {
        return direct;
    }

    const parsed = parseNativeIdentifier(identifier);
    if (!parsed || parsed.tool === null) {
        return null;
    }

    return (
        inFlightNativeIdentifierResolutions.get(`${parsed.tool}:${parsed.backendId}`)
        ?? inFlightNativeIdentifierResolutions.get(`native-session:${parsed.tool}:${parsed.backendId}`)
        ?? null
    );
}

function registerInFlightNativeIdentifierResolution(
    entry: Pick<NativeCliHistoryEntry, 'id' | 'tool' | 'backendId'>,
    promise: Promise<string | null>,
): Promise<string | null> {
    const keys = getInFlightResolutionKeys(entry);
    for (const key of keys) {
        inFlightNativeIdentifierResolutions.set(key, promise);
    }

    return promise.finally(() => {
        for (const key of keys) {
            if (inFlightNativeIdentifierResolutions.get(key) === promise) {
                inFlightNativeIdentifierResolutions.delete(key);
            }
        }
    });
}

function parseNativeIdentifier(identifier: string): { tool: NativeCliHistoryEntry['tool'] | null; backendId: string } | null {
    const nativeSessionMatch = identifier.match(/^native-session:(claude|codex|gemini):(.+)$/);
    if (nativeSessionMatch) {
        return {
            tool: nativeSessionMatch[1] as NativeCliHistoryEntry['tool'],
            backendId: nativeSessionMatch[2]!,
        };
    }

    const qualifiedMatch = identifier.match(/^(claude|codex|gemini):(.+)$/);
    if (qualifiedMatch) {
        return {
            tool: qualifiedMatch[1] as NativeCliHistoryEntry['tool'],
            backendId: qualifiedMatch[2]!,
        };
    }

    if (!identifier.trim()) {
        return null;
    }

    return {
        tool: null,
        backendId: identifier,
    };
}

function isLikelyOnlineSession(session: Session): boolean {
    return isSessionLikelyOnline(session) && session.metadata?.lifecycleState !== 'archived';
}

function isDaemonStartedSession(session: Session): boolean {
    return session.metadata?.startedBy === 'daemon' || session.metadata?.startedFromDaemon === true;
}

function shouldDirectlyReuseOpenedNativeHistorySession(session: Session): boolean {
    if (isInternalCliMirrorSession(session)) {
        return false;
    }

    if (isDaemonStartedSession(session)) {
        return false;
    }

    return true;
}

function resolveSessionIdFromNativeIdentifier(
    identifier: string,
    sessions: Record<string, Session>,
): string | null {
    const directMatch = sessions[identifier];
    if (directMatch) {
        return directMatch.id;
    }

    const synthesizedMatch = identifier.match(SESSION_ROUTE_SESSION_PREFIX);
    if (!synthesizedMatch) {
        return null;
    }

    const sessionId = synthesizedMatch[1]!;
    return sessions[sessionId]?.id ?? null;
}

function compareCandidateSessions(left: Session, right: Session): number {
    const leftOnline = isLikelyOnlineSession(left);
    const rightOnline = isLikelyOnlineSession(right);
    if (leftOnline !== rightOnline) {
        return leftOnline ? -1 : 1;
    }

    const leftStartedByDaemon = isDaemonStartedSession(left);
    const rightStartedByDaemon = isDaemonStartedSession(right);
    if (leftStartedByDaemon !== rightStartedByDaemon) {
        return leftStartedByDaemon ? 1 : -1;
    }

    const leftRunning = left.metadata?.lifecycleState === 'running';
    const rightRunning = right.metadata?.lifecycleState === 'running';
    if (leftRunning !== rightRunning) {
        return leftRunning ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.id.localeCompare(right.id);
}

export function findOrbitSessionIdForNativeIdentifier(
    identifier: string,
    sessions: Record<string, Session> = storage.getState().sessions,
    options: { requireOnline?: boolean } = {},
): string | null {
    const directSessionId = resolveSessionIdFromNativeIdentifier(identifier, sessions);
    if (directSessionId) {
        const directSession = sessions[directSessionId];
        if (!directSession) {
            return null;
        }

        if (isInternalCliMirrorSession(directSession)) {
            return null;
        }

        const directTarget = getResumeMetadataTarget(directSession);
        if (directTarget) {
            const remappedCandidates = Object.values(sessions)
                .filter((session) => {
                    const target = getResumeMetadataTarget(session);
                    if (!target || isInternalCliMirrorSession(session)) {
                        return false;
                    }

                    if (target.backendId !== directTarget.backendId || target.tool !== directTarget.tool) {
                        return false;
                    }

                    if (options.requireOnline) {
                        return isLikelyOnlineSession(session);
                    }

                    return true;
                })
                .sort(compareCandidateSessions);

            const remappedSessionId = remappedCandidates[0]?.id ?? null;
            if (remappedSessionId) {
                return remappedSessionId;
            }
        }

        if (options.requireOnline && !isLikelyOnlineSession(directSession)) {
            return null;
        }

        return directSessionId;
    }

    const parsed = parseNativeIdentifier(identifier);
    if (!parsed) {
        return null;
    }

    const candidates = Object.values(sessions)
        .filter((session) => {
            const target = getResumeMetadataTarget(session);
            if (!target || target.backendId !== parsed.backendId || isInternalCliMirrorSession(session)) {
                return false;
            }

            if (parsed.tool !== null && target.tool !== parsed.tool) {
                return false;
            }

            if (options.requireOnline) {
                return isLikelyOnlineSession(session);
            }

            return true;
        })
        .sort(compareCandidateSessions);

    return candidates[0]?.id ?? null;
}

export function prepareNativeCliPlaceholderSession(
    sessionId: string,
    entry: Pick<
        NativeCliHistoryEntry,
        'tool' | 'backendId' | 'machineId' | 'workingDirectory' | 'title' | 'summary' | 'updatedAt'
    >,
): void {
    markSessionOpenedAsHistoryOnly(sessionId);
    rememberNativeSessionIdentifier(sessionId, buildNativeIdentifier(entry.tool, entry.backendId));
    rememberNativeResumeRequest(sessionId, {
        machineId: entry.machineId,
        tool: entry.tool,
        backendId: entry.backendId,
        workingDirectory: entry.workingDirectory,
        title: entry.title,
        summary: entry.summary ?? null,
        updatedAt: entry.updatedAt,
    });
}

function startNativeResumeWarmup(sessionId: string, identifier: string): void {
    const warmupKey = buildResumeWarmupKey(sessionId, identifier);
    if (inFlightNativeResumeWarmups.has(warmupKey)) {
        return;
    }

    const warmup = (async () => {
        let lastVisibleSessionId: string | null = sessionId;

        for (let attempt = 0; attempt < SESSION_POLL_ATTEMPTS; attempt += 1) {
            const resolvedOnlineSessionId = findOrbitSessionIdForNativeIdentifier(
                identifier,
                storage.getState().sessions,
                { requireOnline: true },
            );
            if (resolvedOnlineSessionId) {
                lastVisibleSessionId = resolvedOnlineSessionId;
                break;
            }

            if (storage.getState().sessions[sessionId]) {
                lastVisibleSessionId = sessionId;
            }

            if (attempt < SESSION_POLL_ATTEMPTS - 1) {
                await delay(POLL_DELAY_MS);
            }
        }

        if (!lastVisibleSessionId) {
            return;
        }

        try {
            await sync.refreshSessionMessages(lastVisibleSessionId);
        } catch {
            // Session encryption/session creation can lag slightly behind warmup.
        }
    })().finally(() => {
        inFlightNativeResumeWarmups.delete(warmupKey);
    });

    inFlightNativeResumeWarmups.set(warmupKey, warmup);
}

async function primeResumedNativeSession(sessionId: string): Promise<void> {
    try {
        await sync.waitForSessionReady(sessionId);
    } catch {
        // A background warmup will keep trying. Returning the resumed session id is
        // still better than failing the whole restore flow on a transient refresh miss.
    }
}

function findRememberedResumeRequestByNativeIdentifier(identifier: string): ResumeNativeCliSessionRequest | null {
    const parsed = parseNativeIdentifier(identifier);
    if (!parsed || parsed.tool === null) {
        return null;
    }

    return findRememberedResumeRequestByIdentifier(parsed.tool, parsed.backendId);
}

export function rememberNativeCliHintsForSession(session: Session): void {
    const nativeTarget = getResumeMetadataTarget(session) ?? getNativeCliSessionTarget(session);
    const fallbackIdentifier = nativeTarget ? `${nativeTarget.tool}:${nativeTarget.backendId}` : null;
    const resumeRequest = buildResumeRequestFromSession(session);

    if (fallbackIdentifier) {
        rememberNativeSessionIdentifier(session.id, fallbackIdentifier);
    }

    if (resumeRequest) {
        rememberNativeResumeRequest(session.id, resumeRequest);
    }
}

export function primeNativeCliHistoryEntryOpen(entry: NativeCliHistoryEntry): Promise<string | null> {
    const existing = getInFlightNativeIdentifierResolution(entry.id);
    if (existing) {
        return existing;
    }

    return registerInFlightNativeIdentifierResolution(entry, openNativeCliHistoryEntry(entry));
}

export async function openRememberedNativeCliSession(sessionId: string): Promise<string | null> {
    const request = getRememberedNativeCliResumeRequest(sessionId);
    if (!request) {
        return null;
    }

    return resumeNativeCliSession(request);
}

interface ResumeMetadataTarget {
    machineId?: string | null;
    tool: NativeCliHistoryEntry['tool'];
    backendId: string;
    workingDirectory: string | null;
    projectRoot: string | null;
}

function buildProjectTitle(path: string | null): string | null {
    if (!path) {
        return null;
    }

    const normalized = path.replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    return segments.at(-1) ?? null;
}

function pickSessionTitle(session: Session, fallbackPath: string | null): string {
    const summaryText = session.metadata?.summary?.text?.trim();
    if (summaryText) {
        return summaryText;
    }

    const projectTitle = buildProjectTitle(fallbackPath);
    if (projectTitle) {
        return projectTitle;
    }

    return 'Recovered Session';
}

function getResumeMetadataTarget(session: Session): ResumeMetadataTarget | null {
    const metadata = session.metadata;
    const machineId = metadata?.machineId ?? null;
    if (!metadata) {
        return null;
    }

    if (metadata.claudeSessionId) {
        return {
            machineId,
            tool: 'claude',
            backendId: metadata.claudeSessionId,
            workingDirectory: metadata.path ?? null,
            projectRoot: metadata.projectRoot ?? null,
        };
    }

    if (metadata.codexThreadId) {
        return {
            machineId,
            tool: 'codex',
            backendId: metadata.codexThreadId,
            workingDirectory: metadata.path ?? null,
            projectRoot: metadata.projectRoot ?? null,
        };
    }

    if (metadata.geminiSessionId) {
        return {
            machineId,
            tool: 'gemini',
            backendId: metadata.geminiSessionId,
            workingDirectory: metadata.path ?? null,
            projectRoot: metadata.projectRoot ?? null,
        };
    }

    if (metadata.nativeHistorySourceTool && metadata.nativeHistorySourceBackendId) {
        return {
            machineId,
            tool: metadata.nativeHistorySourceTool,
            backendId: metadata.nativeHistorySourceBackendId,
            workingDirectory: metadata.path ?? metadata.projectRoot ?? null,
            projectRoot: metadata.projectRoot ?? null,
        };
    }

    return null;
}

function compareResumeEntries(left: NativeCliHistoryEntry, right: NativeCliHistoryEntry): number {
    const leftLive = left.isLive === true;
    const rightLive = right.isLive === true;
    if (leftLive !== rightLive) {
        return leftLive ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.id.localeCompare(right.id);
}

function compareResumeMachines(left: Machine, right: Machine): number {
    const leftOnline = isMachineOnline(left);
    const rightOnline = isMachineOnline(right);
    if (leftOnline !== rightOnline) {
        return leftOnline ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.id.localeCompare(right.id);
}

function findNativeHistoryResumeEntry(target: ResumeMetadataTarget): NativeCliHistoryEntry | null {
    const matches = Object.values(storage.getState().nativeCliHistoryByMachine)
        .flat()
        .filter((entry) => entry.tool === target.tool && entry.backendId === target.backendId)
        .sort(compareResumeEntries);

    return matches[0] ?? null;
}

function resolveResumeMachineId(session: Session, target: ResumeMetadataTarget): string | null {
    const explicitMachineId = session.metadata?.machineId?.trim();
    if (explicitMachineId) {
        return explicitMachineId;
    }

    const machines = Object.values(storage.getState().machines);
    if (machines.length === 0) {
        return null;
    }

    const matchingEntryMachineIds = Array.from(new Set(
        Object.entries(storage.getState().nativeCliHistoryByMachine)
            .filter(([, entries]) => entries.some((entry) => entry.tool === target.tool && entry.backendId === target.backendId))
            .map(([machineId]) => machineId),
    ));
    if (matchingEntryMachineIds.length === 1) {
        return matchingEntryMachineIds[0]!;
    }

    const metadataHost = session.metadata?.host?.trim().toLowerCase();
    if (metadataHost) {
        const hostMatches = machines
            .filter((machine) => machine.metadata?.host?.trim().toLowerCase() === metadataHost)
            .sort(compareResumeMachines);
        if (hostMatches.length === 1) {
            return hostMatches[0]!.id;
        }
    }

    if (machines.length === 1) {
        return machines[0]!.id;
    }

    const onlineMachines = machines.filter(isMachineOnline).sort(compareResumeMachines);
    if (onlineMachines.length === 1) {
        return onlineMachines[0]!.id;
    }

    return null;
}

function buildResumeRequestFromSession(session: Session): ResumeNativeCliSessionRequest | null {
    const metadataTarget = getResumeMetadataTarget(session);
    if (!metadataTarget) {
        const matchingEntry = findMatchingNativeCliEntryForSession(
            session,
            storage.getState().nativeCliHistoryByMachine,
        );
        if (!matchingEntry) {
            return null;
        }

        return {
            machineId: matchingEntry.machineId,
            tool: matchingEntry.tool,
            backendId: matchingEntry.backendId,
            workingDirectory: matchingEntry.workingDirectory,
            title: matchingEntry.title,
            summary: matchingEntry.summary,
            updatedAt: matchingEntry.updatedAt,
        };
    }

    const historyEntry = findNativeHistoryResumeEntry(metadataTarget);
    if (historyEntry) {
        return {
            machineId: historyEntry.machineId,
            tool: historyEntry.tool,
            backendId: historyEntry.backendId,
            workingDirectory: historyEntry.workingDirectory,
            title: historyEntry.title,
            summary: historyEntry.summary,
            updatedAt: historyEntry.updatedAt,
        };
    }

    const machineId = resolveResumeMachineId(session, metadataTarget);
    const workingDirectory = metadataTarget.workingDirectory ?? metadataTarget.projectRoot ?? null;
    if (!machineId || !workingDirectory) {
        return null;
    }

    return {
        machineId,
        tool: metadataTarget.tool,
        backendId: metadataTarget.backendId,
        workingDirectory,
        title: pickSessionTitle(session, workingDirectory),
        summary: session.metadata?.summary?.text?.trim() || null,
        updatedAt: session.updatedAt,
    };
}

async function resumeNativeCliSession(request: ResumeNativeCliSessionRequest): Promise<string> {
    const result = await machineResumeNativeCliHistory(request);

    switch (result.type) {
        case 'success': {
            const nativeIdentifier = buildNativeIdentifier(request.tool, request.backendId);
            clearSessionOpenedAsHistoryOnly(result.sessionId);
            rememberNativeSessionIdentifier(result.sessionId, nativeIdentifier);
            rememberNativeResumeRequest(result.sessionId, request);
            await primeResumedNativeSession(result.sessionId);
            startNativeResumeWarmup(result.sessionId, nativeIdentifier);
            return result.sessionId;
        }
        case 'requestToApproveDirectoryCreation':
            throw new OrbitError('Resume cannot create a new directory. Start this session from its original path first.', false);
        case 'error':
            throw new OrbitError(result.errorMessage, false);
    }
}

export async function openNativeCliHistoryEntry(
    entry: NativeCliHistoryEntry,
    options: { refreshHistory?: boolean } = {},
): Promise<string | null> {
    const nativeIdentifier = buildNativeIdentifier(entry.tool, entry.backendId);
    const refreshHistory = options.refreshHistory ?? true;
    const cachedEntries = storage.getState().nativeCliHistoryByMachine[entry.machineId] ?? [];
    const cachedEntry = cachedEntries.find((candidate) =>
        candidate.tool === entry.tool
        && candidate.backendId === entry.backendId,
    );
    const selectedEntry: NativeCliHistoryEntry = cachedEntry ? {
        ...cachedEntry,
        projectRoot: cachedEntry.projectRoot ?? entry.projectRoot,
        title: cachedEntry.title || entry.title,
        summary: cachedEntry.summary ?? entry.summary,
        updatedAt: Math.max(cachedEntry.updatedAt, entry.updatedAt),
        isLive: entry.isLive === true || cachedEntry.isLive === true,
    } : entry;
    const shouldPreferResumeForSelectedEntry = selectedEntry.isLive === true;
    const rememberResolvedSession = (sessionId: string, options: { historyOnly?: boolean } = {}) => {
        if (options.historyOnly) {
            markSessionOpenedAsHistoryOnly(sessionId);
        } else {
            clearSessionOpenedAsHistoryOnly(sessionId);
        }
        rememberNativeSessionIdentifier(sessionId, nativeIdentifier);
        rememberNativeResumeRequest(sessionId, {
            machineId: selectedEntry.machineId,
            tool: selectedEntry.tool,
            backendId: selectedEntry.backendId,
            workingDirectory: selectedEntry.workingDirectory,
            title: selectedEntry.title,
            summary: selectedEntry.summary,
            updatedAt: selectedEntry.updatedAt,
        });
    };

    const reusableSessionId = findReusableOrbitSessionIdForNativeEntry(
        selectedEntry,
        storage.getState().sessions,
        storage.getState().sessionMessages,
        { allowOffline: true },
    );
    if (reusableSessionId) {
        const existingSession = storage.getState().sessions[reusableSessionId];
        if (existingSession && shouldDirectlyReuseOpenedNativeHistorySession(existingSession)) {
            rememberResolvedSession(reusableSessionId, { historyOnly: !shouldPreferResumeForSelectedEntry });
            return reusableSessionId;
        }
    }

    const viewableSessionId = findViewableOrbitSessionIdForNativeEntry(
        selectedEntry,
        storage.getState().sessions,
        storage.getState().sessionMessages,
        { allowOffline: true },
    );
    if (viewableSessionId && !shouldPreferResumeForSelectedEntry) {
        rememberResolvedSession(viewableSessionId, { historyOnly: true });
        return viewableSessionId;
    }

    try {
        const resumedSessionId = await resumeNativeCliSession({
            machineId: selectedEntry.machineId,
            tool: selectedEntry.tool,
            backendId: selectedEntry.backendId,
            workingDirectory: selectedEntry.workingDirectory,
            title: selectedEntry.title,
            summary: selectedEntry.summary,
            updatedAt: selectedEntry.updatedAt,
        });
        // A successfully resumed native CLI thread should become immediately interactive.
        rememberResolvedSession(resumedSessionId, { historyOnly: false });
        return resumedSessionId;
    } catch (error) {
        if (!refreshHistory) {
            if (
                shouldPreferResumeForSelectedEntry
                && viewableSessionId
                && (isNativeCliResumeUnavailableError(error) || isNativeCliHistoryUnavailableError(error))
            ) {
                rememberResolvedSession(viewableSessionId, { historyOnly: true });
                return viewableSessionId;
            }
            throw error;
        }

        if (isNativeCliResumeUnavailableError(error) || isNativeCliHistoryUnavailableError(error)) {
            if (shouldPreferResumeForSelectedEntry && viewableSessionId) {
                rememberResolvedSession(viewableSessionId, { historyOnly: true });
                return viewableSessionId;
            }
            throw error;
        }

        const refreshedEntries = await refreshNativeCliHistoryForMachine(entry.machineId, { force: true });
        const refreshedEntry = refreshedEntries.find((candidate) =>
            candidate.tool === entry.tool
            && candidate.backendId === entry.backendId,
        );

        if (!refreshedEntry) {
            throw error;
        }

        const resumedSessionId = await resumeNativeCliSession({
            machineId: refreshedEntry.machineId,
            tool: refreshedEntry.tool,
            backendId: refreshedEntry.backendId,
            workingDirectory: refreshedEntry.workingDirectory,
            title: refreshedEntry.title,
            summary: refreshedEntry.summary,
            updatedAt: refreshedEntry.updatedAt,
        });
        rememberResolvedSession(resumedSessionId, { historyOnly: false });
        return resumedSessionId;
    }
}

export async function openNativeCliSessionFromSession(session: Session): Promise<string | null> {
    const machineId = session.metadata?.machineId;
    const nativeTarget = getNativeCliSessionTarget(session);
    const matchingEntry = findMatchingNativeCliEntryForSession(
        session,
        storage.getState().nativeCliHistoryByMachine,
    );
    const fallbackIdentifier = nativeTarget
        ? `${nativeTarget.tool}:${nativeTarget.backendId}`
        : matchingEntry
            ? `${matchingEntry.tool}:${matchingEntry.backendId}`
            : null;
    const resumeRequest = buildResumeRequestFromSession(session);
    const importedNativeHistoryWrapper = isImportedNativeHistoryWrapperSession(session);
    rememberNativeCliHintsForSession(session);

    if (
        isLikelyOnlineSession(session)
        && !isInternalCliMirrorSession(session)
        && !importedNativeHistoryWrapper
    ) {
        return session.id;
    }

    if (resumeRequest) {
        return resumeNativeCliSession(resumeRequest);
    }

    if (!machineId) {
        return fallbackIdentifier ? openNativeCliSessionFromIdentifier(fallbackIdentifier) : null;
    }

    const cachedEntries = storage.getState().nativeCliHistoryByMachine[machineId] ?? [];
    let entry = findNativeCliEntryForSession(session, cachedEntries);
    if (!entry) {
        const refreshedEntries = await refreshNativeCliHistoryForMachine(machineId, { force: true });
        entry = findNativeCliEntryForSession(session, refreshedEntries);
        if (!entry) {
            return fallbackIdentifier ? openNativeCliSessionFromIdentifier(fallbackIdentifier) : null;
        }
    }

    return openNativeCliHistoryEntry(entry, { refreshHistory: false });
}

export async function openNativeCliSessionFromIdentifier(identifier: string): Promise<string | null> {
    const reusableSessionId = findReusableSessionForIdentifier(identifier);
    if (reusableSessionId) {
        return reusableSessionId;
    }

    const cachedEntries = Object.values(storage.getState().nativeCliHistoryByMachine).flat();
    const cachedEntry = cachedEntries
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .find((candidate) => findNativeCliEntryByIdentifier(identifier, [candidate]) !== null);

    if (cachedEntry) {
        try {
            return await openNativeCliHistoryEntry(cachedEntry);
        } catch {
            // Fall through to remembered resume / history refresh below.
        }
    }

    const rememberedResumeRequest = findRememberedResumeRequestByNativeIdentifier(identifier);
    if (rememberedResumeRequest) {
        try {
            return await resumeNativeCliSession(rememberedResumeRequest);
        } catch {
            // Fall through to machine history refresh below.
        }
    }

    await sync.refreshSessions();
    const refreshedReusableSessionId = findReusableSessionForIdentifier(identifier);
    if (refreshedReusableSessionId) {
        return refreshedReusableSessionId;
    }

    const machines = Object.values(storage.getState().machines);

    const refreshedByMachine = await Promise.all(
        machines.map(async (machine) => {
            const entries = await refreshNativeCliHistoryForMachine(machine.id, { force: true });
            return { machineId: machine.id, entries };
        }),
    );

    const entry = refreshedByMachine
        .flatMap((result) => result.entries)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .find((candidate) => findNativeCliEntryByIdentifier(identifier, [candidate]) !== null);

    if (!entry) {
        return null;
    }

    return openNativeCliHistoryEntry(entry, { refreshHistory: false });
}
