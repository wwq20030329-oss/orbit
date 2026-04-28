import * as React from 'react';

import type { AgentState, Session } from '@/sync/storageTypes';

import {
    getSessionStatus,
    type SessionStatus,
    type SessionStatusOptions,
    useSessionStatus,
} from './sessionStatus';
import { isSessionInteractionBlocked } from './sessionInteraction';

export function didSessionControlReturnToApp(
    previousState: AgentState | null | undefined,
    nextState: AgentState | null | undefined,
): boolean {
    return previousState?.controlledByUser === true && nextState?.controlledByUser !== true;
}

export interface SessionControlState {
    interactionBlocked: boolean;
    isArchivedSession: boolean;
    isConnected: boolean;
    isDisconnected: boolean;
    isInactiveArchivedSession: boolean;
    status: SessionStatus;
}

export interface SessionControlStateOptions extends Omit<SessionStatusOptions, 'thinkingStatusText'> {}

function buildSessionControlState(
    session: Session,
    interactionBlocked: boolean,
    status: SessionStatus,
): SessionControlState {
    const isArchivedSession = session.metadata?.lifecycleState === 'archived';
    const isDisconnected = !status.isConnected;

    return {
        interactionBlocked,
        isArchivedSession,
        isConnected: status.isConnected,
        isDisconnected,
        isInactiveArchivedSession: isArchivedSession && isDisconnected,
        status,
    };
}

export function getSessionControlState(
    session: Session,
    options: SessionControlStateOptions = {},
): SessionControlState {
    const interactionBlocked = isSessionInteractionBlocked(session, options);
    const status = getSessionStatus(session, {
        ...options,
        interactionBlocked,
    });

    return buildSessionControlState(session, interactionBlocked, status);
}

export function useSessionControlState(
    session: Session,
    options: SessionControlStateOptions = {},
): SessionControlState {
    const interactionBlocked = isSessionInteractionBlocked(session, options);
    const status = useSessionStatus(session, {
        ...options,
        interactionBlocked,
    });

    return React.useMemo(
        () => buildSessionControlState(session, interactionBlocked, status),
        [interactionBlocked, session, status],
    );
}
