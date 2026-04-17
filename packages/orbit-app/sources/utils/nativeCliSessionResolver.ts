import type { NativeCliHistoryEntry, NativeCliTool, Session } from '@/sync/storageTypes';
import { isSessionLikelyOnline } from './presence';

export interface NativeCliSessionTarget {
    machineId: string;
    tool: NativeCliTool;
    backendId: string;
    workingDirectory: string | null;
    projectRoot: string | null;
}

export function isImportedNativeHistoryWrapperSession(session: Session): boolean {
    return Boolean(
        session.metadata?.nativeHistorySourceTool
        && session.metadata?.nativeHistorySourceBackendId
        && !session.metadata?.claudeSessionId
        && !session.metadata?.codexThreadId
        && !session.metadata?.geminiSessionId,
    );
}

export function getNativeCliSessionTarget(session: Session): NativeCliSessionTarget | null {
    const machineId = session.metadata?.machineId;
    if (!machineId) {
        return null;
    }

    if (session.metadata?.claudeSessionId) {
        return {
            machineId,
            tool: 'claude',
            backendId: session.metadata.claudeSessionId,
            workingDirectory: session.metadata?.path ?? null,
            projectRoot: session.metadata?.projectRoot ?? null,
        };
    }

    if (session.metadata?.codexThreadId) {
        return {
            machineId,
            tool: 'codex',
            backendId: session.metadata.codexThreadId,
            workingDirectory: session.metadata?.path ?? null,
            projectRoot: session.metadata?.projectRoot ?? null,
        };
    }

    if (session.metadata?.geminiSessionId) {
        return {
            machineId,
            tool: 'gemini',
            backendId: session.metadata.geminiSessionId,
            workingDirectory: session.metadata?.path ?? null,
            projectRoot: session.metadata?.projectRoot ?? null,
        };
    }

    if (session.metadata?.nativeHistorySourceTool && session.metadata?.nativeHistorySourceBackendId) {
        return {
            machineId,
            tool: session.metadata.nativeHistorySourceTool,
            backendId: session.metadata.nativeHistorySourceBackendId,
            workingDirectory: session.metadata?.path ?? session.metadata?.projectRoot ?? null,
            projectRoot: session.metadata?.projectRoot ?? null,
        };
    }

    return null;
}

export function shouldAutoResolveNativeCliSession(session: Session): boolean {
    if (!getNativeCliSessionTarget(session)) {
        return false;
    }

    if (session.metadata?.sessionRole === 'native-live-mirror') {
        return true;
    }

    if (isImportedNativeHistoryWrapperSession(session)) {
        return true;
    }

    if (session.metadata?.lifecycleState === 'archived') {
        return false;
    }

    return !isSessionLikelyOnline(session);
}

export function findNativeCliEntryForSession(
    session: Session,
    entries: NativeCliHistoryEntry[],
): NativeCliHistoryEntry | null {
    const target = getNativeCliSessionTarget(session);
    if (!target) {
        return null;
    }

    const matches = entries.filter((entry) =>
        entry.machineId === target.machineId
        && entry.tool === target.tool
        && entry.backendId === target.backendId,
    );

    if (matches.length === 0) {
        return null;
    }

    const exactWorkingDirectoryMatch = matches.find((entry) =>
        target.workingDirectory !== null && entry.workingDirectory === target.workingDirectory,
    );
    if (exactWorkingDirectoryMatch) {
        return exactWorkingDirectoryMatch;
    }

    const exactProjectRootMatch = matches.find((entry) =>
        target.projectRoot !== null && entry.projectRoot === target.projectRoot,
    );
    if (exactProjectRootMatch) {
        return exactProjectRootMatch;
    }

    return matches
        .slice()
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

export function findNativeCliEntryByIdentifier(
    identifier: string,
    entries: NativeCliHistoryEntry[],
): NativeCliHistoryEntry | null {
    const directMatch = entries.find((entry) =>
        entry.backendId === identifier
        || entry.id === identifier
        || `native-session:${entry.tool}:${entry.backendId}` === identifier,
    );

    if (directMatch) {
        return directMatch;
    }

    const parsed = parseNativeIdentifier(identifier);
    if (!parsed) {
        return null;
    }

    return entries.find((entry) =>
        entry.tool === parsed.tool && entry.backendId === parsed.backendId,
    ) ?? null;
}

export function isExplicitNativeCliIdentifier(identifier: string): boolean {
    return parseNativeIdentifier(identifier) !== null;
}

export function getRouteIdentifierForNativeCliEntry(
    entry: Pick<NativeCliHistoryEntry, 'id' | 'tool' | 'backendId'>,
): string {
    const synthesizedSessionMatch = getSynthesizedOrbitSessionIdForNativeCliEntry(entry);
    if (synthesizedSessionMatch) {
        return entry.id;
    }

    return `${entry.tool}:${entry.backendId}`;
}

export function findNativeCliIdentifiersForOrbitSessionId(
    sessionId: string,
    entriesByMachine: Record<string, NativeCliHistoryEntry[]>,
): string[] {
    const identifiers = new Set<string>();

    for (const entries of Object.values(entriesByMachine)) {
        for (const entry of entries) {
            if (getSynthesizedOrbitSessionIdForNativeCliEntry(entry) === sessionId) {
                identifiers.add(entry.id);
            }
        }
    }

    return [...identifiers];
}

export function getSynthesizedOrbitSessionIdForNativeCliEntry(
    entry: Pick<NativeCliHistoryEntry, 'id'>,
): string | null {
    const synthesizedSessionMatch = entry.id.match(/^(claude|codex|gemini):session:(.+)$/);
    return synthesizedSessionMatch?.[2] ?? null;
}

function parseNativeIdentifier(identifier: string): { tool: NativeCliTool; backendId: string } | null {
    const nativeMatch = identifier.match(/^native-session:(claude|codex|gemini):(.+)$/);
    if (nativeMatch) {
        return {
            tool: nativeMatch[1] as NativeCliTool,
            backendId: nativeMatch[2]!,
        };
    }

    const entryMatch = identifier.match(/^(claude|codex|gemini):(.+)$/);
    if (entryMatch) {
        return {
            tool: entryMatch[1] as NativeCliTool,
            backendId: entryMatch[2]!,
        };
    }

    return null;
}
