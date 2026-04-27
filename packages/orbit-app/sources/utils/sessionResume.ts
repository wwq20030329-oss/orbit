import type { PersistedNativeCliResumeRequest } from '@/sync/persistence';
import type { Machine, Session } from '@/sync/storageTypes';
import { t } from '@/text';
import { isMachineOnline } from './machineUtils';
import { buildResumeCommand } from './resumeCommand';

export type ResumeAvailability = {
    canResume: boolean;
    canShowResume: boolean;
    subtitle: string;
    message: string;
};

export type SessionResumeTarget = {
    type: 'orbit-session';
    machineId: string;
    sessionId: string;
} | {
    type: 'native-cli-history';
    machineId: string;
    sessionId: string;
    request: PersistedNativeCliResumeRequest;
};

export interface SessionResumeOptions {
    interactionBlocked?: boolean;
    nativeResumeRequest?: PersistedNativeCliResumeRequest | null;
}

function pickNativeResumeRequestTitle(session: Session, fallbackPath: string): string {
    const summaryText = session.metadata?.summary?.text?.trim();
    if (summaryText) {
        return summaryText;
    }

    const lastPathPart = fallbackPath.split('/').filter(Boolean).at(-1)?.trim();
    return lastPathPart || 'Recovered Session';
}

function buildNativeResumeRequestFromSession(session: Session): PersistedNativeCliResumeRequest | null {
    const metadata = session.metadata;
    const machineId = metadata?.machineId?.trim();
    if (!metadata || !machineId) {
        return null;
    }

    const target = metadata.claudeSessionId
        ? { tool: 'claude' as const, backendId: metadata.claudeSessionId }
        : metadata.codexThreadId
            ? { tool: 'codex' as const, backendId: metadata.codexThreadId }
            : metadata.geminiSessionId
                ? { tool: 'gemini' as const, backendId: metadata.geminiSessionId }
                : metadata.nativeHistorySourceTool && metadata.nativeHistorySourceBackendId
                    ? { tool: metadata.nativeHistorySourceTool, backendId: metadata.nativeHistorySourceBackendId }
                    : null;
    const workingDirectory = metadata.path?.trim() || metadata.projectRoot?.trim() || null;
    if (!target || !workingDirectory) {
        return null;
    }

    return {
        machineId,
        tool: target.tool,
        backendId: target.backendId,
        workingDirectory,
        title: pickNativeResumeRequestTitle(session, workingDirectory),
        summary: metadata.summary?.text?.trim() || null,
        updatedAt: session.updatedAt,
    };
}

export function resolveSessionResumeTarget(
    session: Session,
    options: SessionResumeOptions = {},
): SessionResumeTarget | null {
    const nativeResumeRequest = options.nativeResumeRequest ?? null;
    const machineId = session.metadata?.machineId?.trim() ?? '';
    const canResumeOrbitSession = Boolean(machineId && buildResumeCommand(session.metadata ?? {}));
    const inferredNativeResumeRequest = nativeResumeRequest ?? buildNativeResumeRequestFromSession(session);

    if (inferredNativeResumeRequest) {
        return {
            type: 'native-cli-history',
            machineId: inferredNativeResumeRequest.machineId,
            sessionId: session.id,
            request: inferredNativeResumeRequest,
        };
    }

    if (canResumeOrbitSession) {
        return {
            type: 'orbit-session',
            machineId,
            sessionId: session.id,
        };
    }

    return null;
}

export function getSessionResumeAvailability(
    session: Session,
    machine: Machine | null | undefined,
    isConnected: boolean,
    options: SessionResumeOptions = {},
): ResumeAvailability {
    if (isConnected) {
        return {
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        };
    }

    const resumeTarget = resolveSessionResumeTarget(session, options);
    const machineId = resumeTarget?.machineId?.trim() ?? '';
    if (!machineId) {
        const message = t('sessionInfo.resumeSessionMissingMachine');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!resumeTarget) {
        const message = t('sessionInfo.resumeSessionMissingBackendId');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!machine) {
        const message = t('sessionInfo.resumeSessionSameMachineOnly');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!isMachineOnline(machine)) {
        const message = t('sessionInfo.resumeSessionMachineOffline');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (resumeTarget.type === 'native-cli-history') {
        return {
            canResume: true,
            canShowResume: true,
            subtitle: t('sessionInfo.resumeSessionSubtitle'),
            message: t('sessionInfo.resumeSessionSubtitle'),
        };
    }

    if (!machine.metadata?.resumeSupport?.rpcAvailable) {
        const message = t('sessionInfo.resumeSessionNeedsOrbitAgent');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    return {
        canResume: true,
        canShowResume: true,
        subtitle: t('sessionInfo.resumeSessionSubtitle'),
        message: t('sessionInfo.resumeSessionSubtitle'),
    };
}
