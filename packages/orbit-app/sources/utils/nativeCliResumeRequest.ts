import { storage } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';
import { findMatchingNativeCliEntryForSession } from '@/utils/nativeCliHistory';
import type { ResumeNativeCliSessionRequest } from '@/utils/nativeCliRecoveryState';
import { buildProjectTitle } from '@/utils/projectTitle';

interface ResumeMetadataTarget {
    machineId?: string | null;
    tool: NativeCliHistoryEntry['tool'];
    backendId: string;
    workingDirectory: string | null;
    projectRoot: string | null;
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

export function buildNativeCliHistoryEntryFromSession(session: Session): NativeCliHistoryEntry | null {
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
        isLive: false,
    };
}

export function getResumeTargetForSession(session: Session): ResumeMetadataTarget | null {
    return getResumeMetadataTarget(session);
}

export function buildResumeRequestFromSession(session: Session): ResumeNativeCliSessionRequest | null {
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
