import * as React from 'react';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { machineResumeNativeCliHistory, machineResumeSession, sessionKill } from '@/sync/ops';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { storage, useLocalSetting, useMachine, useSetting } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { OrbitError } from '@/utils/errors';
import { copySessionMetadataToClipboard } from '@/utils/copySessionMetadataToClipboard';
import { useRouter } from 'expo-router';
import { getRememberedNativeCliResumeRequest } from '@/utils/openNativeCliSession';
import { getSessionResumeAvailability, resolveSessionResumeTarget } from '@/utils/sessionResume';
import { getSessionControlState } from '@/utils/sessionControlState';

interface UseSessionQuickActionsOptions {
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    onAfterCopySessionMetadata?: () => void;
}

export function useSessionQuickActions(
    session: Session,
    options: UseSessionQuickActionsOptions = {},
) {
    const {
        onAfterArchive,
        onAfterCopySessionMetadata,
    } = options;
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const devModeEnabled = useLocalSetting('devModeEnabled');
    const expResumeSession = useSetting('expResumeSession');
    const sessionControlState = React.useMemo(
        () => getSessionControlState(session, { sessionId: session.id }),
        [session],
    );
    const interactionBlocked = sessionControlState.interactionBlocked;
    const shouldExposeResume = expResumeSession || interactionBlocked;
    const nativeResumeRequest = getRememberedNativeCliResumeRequest(session.id);
    const resumeTarget = React.useMemo(
        () => resolveSessionResumeTarget(session, { interactionBlocked, nativeResumeRequest }),
        [interactionBlocked, nativeResumeRequest, session],
    );
    const machine = useMachine(resumeTarget?.machineId ?? '');
    const resumeAvailability = React.useMemo(
        () => shouldExposeResume
            ? getSessionResumeAvailability(session, machine, sessionControlState.isConnected, { interactionBlocked, nativeResumeRequest })
            : { canResume: false, canShowResume: false, subtitle: '', message: '' },
        [interactionBlocked, machine, nativeResumeRequest, session, sessionControlState.isConnected, shouldExposeResume],
    );

    const openDetails = React.useCallback(() => {
        router.push(`/session/${session.id}/info`);
    }, [router, session.id]);

    const copySessionMetadata = React.useCallback(() => {
        void (async () => {
            const copied = await copySessionMetadataToClipboard(session);
            if (copied) {
                onAfterCopySessionMetadata?.();
            }
        })();
    }, [onAfterCopySessionMetadata, session]);

    const [resumingSession, performResume] = useOrbitAction(async () => {
        if (!resumeAvailability.canResume) {
            throw new OrbitError(resumeAvailability.message, false);
        }

        if (!resumeTarget) {
            throw new OrbitError(t('sessionInfo.resumeSessionMissingMachine'), false);
        }

        const result = resumeTarget.type === 'native-cli-history'
            ? await machineResumeNativeCliHistory(resumeTarget.request)
            : await machineResumeSession({
                machineId: resumeTarget.machineId,
                sessionId: session.id,
            });

        switch (result.type) {
            case 'success': {
                for (let attempt = 0; attempt < 3; attempt++) {
                    await sync.refreshSessions();
                    if (storage.getState().sessions[result.sessionId]) {
                        break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }

                if (session.permissionMode) {
                    storage.getState().updateSessionPermissionMode(result.sessionId, session.permissionMode);
                }
                if (session.modelMode) {
                    storage.getState().updateSessionModelMode(result.sessionId, session.modelMode);
                }
                if (session.effortLevel) {
                    storage.getState().updateSessionEffortLevel(result.sessionId, session.effortLevel);
                }

                navigateToSession(result.sessionId);
                return;
            }
            case 'requestToApproveDirectoryCreation':
                throw new OrbitError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'), false);
            case 'error':
                throw new OrbitError(result.errorMessage, false);
        }
    });

    const [archivingSession, performArchive] = useOrbitAction(async () => {
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId);

        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new OrbitError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
        onAfterArchive?.();
    });

    const archiveSession = React.useCallback(() => {
        performArchive();
    }, [performArchive]);

    const resumeSession = React.useCallback(() => {
        performResume();
    }, [performResume]);

    return {
        archiveSession,
        archivingSession,
        canArchive: sessionControlState.isConnected,
        canCopySessionMetadata: __DEV__ || devModeEnabled,
        canResume: resumeAvailability.canResume,
        canShowResume: resumeAvailability.canShowResume,
        copySessionMetadata,
        openDetails,
        resumeSession,
        resumeSessionSubtitle: resumeAvailability.subtitle,
        resumingSession,
    };
}
