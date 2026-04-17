import { machineDeleteNativeCliHistory, sessionDelete, sessionKill } from '@/sync/ops';
import { storage } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { findExistingOrbitSessionIdForNativeEntry, getSessionCliTool } from '@/utils/nativeCliHistory';
import type { CliThreadListItem, CliThreadProjectGroup } from './cliThreadList';
import { OrbitError } from './errors';

function isSessionOnline(session: Session): boolean {
    return session.active || session.presence === 'online';
}

function getLinkedNativeHistoryTarget(session: Session): {
    machineId: string;
    tool: 'claude' | 'codex' | 'gemini';
    backendId: string;
    workingDirectory?: string;
} | null {
    const tool = getSessionCliTool(session);
    const machineId = session.metadata?.machineId ?? null;
    const backendId = session.metadata?.claudeSessionId
        ?? session.metadata?.codexThreadId
        ?? session.metadata?.geminiSessionId
        ?? session.metadata?.nativeHistorySourceBackendId
        ?? null;

    if (tool === 'other' || !machineId || !backendId) {
        return null;
    }

    return {
        machineId,
        tool,
        backendId,
        workingDirectory: session.metadata?.path ?? session.metadata?.projectRoot ?? undefined,
    };
}

function removeNativeEntryFromCache(machineId: string, tool: 'claude' | 'codex' | 'gemini', backendId: string): void {
    const existingEntries = storage.getState().nativeCliHistoryByMachine[machineId] ?? [];
    storage.getState().applyNativeCliHistory(
        machineId,
        existingEntries.filter((entry) => !(entry.tool === tool && entry.backendId === backendId)),
    );
}

export function findLinkedSessionForCliThreadItem(item: CliThreadListItem): Session | null {
    if (item.session) {
        return item.session;
    }

    if (!item.entry) {
        return null;
    }

    const existingSessionId = findExistingOrbitSessionIdForNativeEntry(
        item.entry,
        storage.getState().sessions,
        { allowOffline: true },
    );

    if (!existingSessionId) {
        return null;
    }

    return storage.getState().sessions[existingSessionId] ?? null;
}

export async function deleteCliThreadItem(item: CliThreadListItem): Promise<void> {
    const linkedSession = findLinkedSessionForCliThreadItem(item);

    if (linkedSession && isSessionOnline(linkedSession)) {
        await sessionKill(linkedSession.id).catch(() => {});
    }

    if (item.entry) {
        const nativeDeleteResult = await machineDeleteNativeCliHistory({
            machineId: item.entry.machineId,
            tool: item.entry.tool,
            backendId: item.entry.backendId,
            workingDirectory: item.entry.workingDirectory,
        });

        if (!nativeDeleteResult.success) {
            throw new OrbitError(nativeDeleteResult.message || 'Failed to delete session', false);
        }

        removeNativeEntryFromCache(item.entry.machineId, item.entry.tool, item.entry.backendId);
    } else if (linkedSession) {
        const nativeTarget = getLinkedNativeHistoryTarget(linkedSession);
        if (nativeTarget) {
            const nativeDeleteResult = await machineDeleteNativeCliHistory(nativeTarget);
            if (!nativeDeleteResult.success) {
                throw new OrbitError(nativeDeleteResult.message || 'Failed to delete session', false);
            }

            removeNativeEntryFromCache(nativeTarget.machineId, nativeTarget.tool, nativeTarget.backendId);
        }
    }

    if (linkedSession) {
        const result = await sessionDelete(linkedSession.id);
        if (!result.success) {
            throw new OrbitError(result.message || 'Failed to delete session', false);
        }

        storage.getState().deleteSession(linkedSession.id);
    }
}

export async function deleteCliProjectGroup(project: CliThreadProjectGroup): Promise<void> {
    for (const item of project.items) {
        await deleteCliThreadItem(item);
    }
}
