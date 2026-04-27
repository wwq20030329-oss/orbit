import type { Session } from '@/sync/storageTypes';

import type { SessionControlState } from './sessionControlState';

export type SessionRunStateKind =
    | 'idle'
    | 'running'
    | 'connecting'
    | 'permission_required'
    | 'reconnecting'
    | 'disconnected'
    | 'archived';

export type SessionRunStateTone = 'neutral' | 'active' | 'warning' | 'offline';
export type SessionRunStateIcon =
    | 'archive-outline'
    | 'checkmark-circle-outline'
    | 'cloud-offline-outline'
    | 'shield-checkmark-outline'
    | 'sparkles-outline'
    | 'sync-outline';
export type SessionRunStateLabelKey =
    | 'sessionRun.running'
    | 'sessionRun.connecting'
    | 'sessionRun.permissionRequired'
    | 'sessionRun.reconnecting'
    | 'sessionRun.disconnected'
    | 'sessionRun.archived';

export interface SessionRunState {
    kind: SessionRunStateKind;
    labelKey: SessionRunStateLabelKey | null;
    icon: SessionRunStateIcon;
    tone: SessionRunStateTone;
    isRunning: boolean;
    canAbort: boolean;
    canSendMessages: boolean;
    controlAvailable: boolean;
    showsProgress: boolean;
    shouldShowInlineStatus: boolean;
}

interface GetSessionRunStateOptions {
    session: Session;
    sessionControlState: SessionControlState;
    connectionPending: boolean;
}

function buildSessionRunState(input: {
    kind: SessionRunStateKind;
    labelKey: SessionRunStateLabelKey | null;
    icon: SessionRunStateIcon;
    tone: SessionRunStateTone;
    isRunning: boolean;
    controlAvailable: boolean;
    canSendMessages: boolean;
    showsProgress?: boolean;
    shouldShowInlineStatus?: boolean;
}): SessionRunState {
    return {
        ...input,
        canAbort: input.isRunning && input.controlAvailable,
        showsProgress: input.showsProgress ?? false,
        shouldShowInlineStatus: input.shouldShowInlineStatus ?? input.kind !== 'idle',
    };
}

export function getSessionRunState({
    session,
    sessionControlState,
    connectionPending,
}: GetSessionRunStateOptions): SessionRunState {
    const isInactiveArchivedSession = sessionControlState.isInactiveArchivedSession
        || (session.metadata?.lifecycleState === 'archived' && sessionControlState.isDisconnected);
    const isRunning = session.thinking === true && !isInactiveArchivedSession;
    const controlAvailable = !isInactiveArchivedSession;
    const canSendMessages = controlAvailable
        && !isRunning
        && !sessionControlState.isDisconnected
        && !connectionPending
        && sessionControlState.status.state !== 'permission_required';

    if (isInactiveArchivedSession) {
        return buildSessionRunState({
            kind: 'archived',
            labelKey: 'sessionRun.archived',
            icon: 'archive-outline',
            tone: 'neutral',
            isRunning: false,
            controlAvailable: false,
            canSendMessages: false,
            shouldShowInlineStatus: false,
        });
    }

    if (sessionControlState.status.state === 'permission_required') {
        return buildSessionRunState({
            kind: 'permission_required',
            labelKey: 'sessionRun.permissionRequired',
            icon: 'shield-checkmark-outline',
            tone: 'warning',
            isRunning,
            controlAvailable,
            canSendMessages,
        });
    }

    if (isRunning && sessionControlState.isDisconnected) {
        return buildSessionRunState({
            kind: 'reconnecting',
            labelKey: 'sessionRun.reconnecting',
            icon: 'cloud-offline-outline',
            tone: 'offline',
            isRunning,
            controlAvailable,
            canSendMessages: false,
            showsProgress: true,
        });
    }

    if (connectionPending) {
        return buildSessionRunState({
            kind: 'connecting',
            labelKey: 'sessionRun.connecting',
            icon: 'sync-outline',
            tone: 'neutral',
            isRunning,
            controlAvailable,
            canSendMessages: false,
            showsProgress: true,
        });
    }

    if (isRunning) {
        return buildSessionRunState({
            kind: 'running',
            labelKey: 'sessionRun.running',
            icon: 'sparkles-outline',
            tone: 'active',
            isRunning,
            controlAvailable,
            canSendMessages,
            showsProgress: true,
        });
    }

    if (sessionControlState.isDisconnected) {
        return buildSessionRunState({
            kind: 'disconnected',
            labelKey: 'sessionRun.disconnected',
            icon: 'cloud-offline-outline',
            tone: 'offline',
            isRunning: false,
            controlAvailable,
            canSendMessages: false,
        });
    }

    return buildSessionRunState({
        kind: 'idle',
        labelKey: null,
        icon: 'checkmark-circle-outline',
        tone: 'neutral',
        isRunning: false,
        controlAvailable,
        canSendMessages,
        shouldShowInlineStatus: false,
    });
}
