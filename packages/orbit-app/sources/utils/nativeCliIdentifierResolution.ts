import type { NativeCliHistoryEntry } from '@/sync/storageTypes';

const inFlightNativeIdentifierResolutions = new Map<string, Promise<string | null>>();

export function buildNativeIdentifier(
    tool: NativeCliHistoryEntry['tool'],
    backendId: string,
): string {
    return `${tool}:${backendId}`;
}

export function parseNativeIdentifier(
    identifier: string,
): { tool: NativeCliHistoryEntry['tool'] | null; backendId: string } | null {
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

function getInFlightResolutionKeys(
    entry: Pick<NativeCliHistoryEntry, 'id' | 'tool' | 'backendId'>,
): string[] {
    return Array.from(new Set([
        entry.id,
        `${entry.tool}:${entry.backendId}`,
        `native-session:${entry.tool}:${entry.backendId}`,
    ]));
}

export function getInFlightNativeIdentifierResolution(
    identifier: string,
): Promise<string | null> | null {
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

export function registerInFlightNativeIdentifierResolution(
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
