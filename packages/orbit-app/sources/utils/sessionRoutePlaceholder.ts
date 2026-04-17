import { storage } from '@/sync/storage';
import { findNativeCliEntryByIdentifier } from '@/utils/nativeCliSessionResolver';
import { getRememberedNativeCliResumeRequest } from '@/utils/openNativeCliSession';
import { buildProjectTitle } from '@/utils/projectTitle';

export interface SessionRoutePlaceholder {
    title: string;
    subtitle?: string;
    flavor: 'claude' | 'codex' | 'gemini';
}

function formatPathRelativeToHome(path: string, homeDir?: string): string {
    if (!homeDir) {
        return path;
    }

    const normalizedHome = homeDir.endsWith('/') ? homeDir.slice(0, -1) : homeDir;
    if (!path.startsWith(normalizedHome)) {
        return path;
    }

    const relativePath = path.slice(normalizedHome.length);
    if (relativePath.startsWith('/')) {
        return `~${relativePath}`;
    }

    return relativePath ? `~/${relativePath}` : '~';
}

export function getSessionRoutePlaceholder(identifier: string): SessionRoutePlaceholder | null {
    const state = storage.getState();
    const cachedEntries = Object.values(state.nativeCliHistoryByMachine).flat();
    const matchedEntry = findNativeCliEntryByIdentifier(identifier, cachedEntries);

    if (matchedEntry) {
        const machine = state.machines[matchedEntry.machineId];
        return {
            title: matchedEntry.title || buildProjectTitle(matchedEntry.workingDirectory) || 'Session',
            subtitle: matchedEntry.workingDirectory
                ? formatPathRelativeToHome(matchedEntry.workingDirectory, machine?.metadata?.homeDir)
                : undefined,
            flavor: matchedEntry.tool,
        };
    }

    const rememberedRequest = getRememberedNativeCliResumeRequest(identifier);
    if (!rememberedRequest) {
        return null;
    }

    const machine = state.machines[rememberedRequest.machineId];
    return {
        title: rememberedRequest.title
            || buildProjectTitle(rememberedRequest.workingDirectory)
            || 'Session',
        subtitle: rememberedRequest.workingDirectory
            ? formatPathRelativeToHome(rememberedRequest.workingDirectory, machine?.metadata?.homeDir)
            : undefined,
        flavor: rememberedRequest.tool,
    };
}
