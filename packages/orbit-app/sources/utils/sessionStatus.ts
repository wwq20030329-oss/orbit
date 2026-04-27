import * as React from 'react';

import type { Session } from '@/sync/storageTypes';
import { t } from '@/text';

import { isSessionLikelyOnline } from './presence';
import { isSessionInteractionBlocked } from './sessionInteraction';

export type SessionState = 'disconnected' | 'thinking' | 'waiting' | 'permission_required';

export interface SessionStatus {
    state: SessionState;
    isConnected: boolean;
    statusText: string;
    shouldShowStatus: boolean;
    statusColor: string;
    statusDotColor: string;
    isPulsing?: boolean;
}

export interface SessionStatusOptions {
    sessionId?: string;
    interactionBlocked?: boolean;
    thinkingStatusText?: string;
}

function formatLastSeen(activeAt: number, isActive: boolean = false): string {
    if (isActive) {
        return t('status.activeNow');
    }

    const now = Date.now();
    const diffMs = now - activeAt;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return t('time.justNow');
    }

    if (diffMinutes < 60) {
        return t('time.minutesAgo', { count: diffMinutes });
    }

    if (diffHours < 24) {
        return t('time.hoursAgo', { count: diffHours });
    }

    if (diffDays < 7) {
        return t('sessionHistory.daysAgo', { count: diffDays });
    }

    const date = new Date(activeAt);
    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    };
    return date.toLocaleDateString(undefined, options);
}

export function getSessionStatus(
    session: Session,
    options: SessionStatusOptions = {},
): SessionStatus {
    const isOnline = !isSessionInteractionBlocked(session, options) && isSessionLikelyOnline(session);
    const lastSeenAt = Math.max(session.activeAt, session.liveRuntime?.lastDetachAt ?? 0);
    const hasPermissions = Boolean(
        session.agentState?.requests && Object.keys(session.agentState.requests).length > 0,
    );

    if (!isOnline) {
        return {
            state: 'disconnected',
            isConnected: false,
            statusText: t('status.lastSeen', { time: formatLastSeen(lastSeenAt, false) }),
            shouldShowStatus: true,
            statusColor: '#999',
            statusDotColor: '#999',
        };
    }

    if (hasPermissions) {
        return {
            state: 'permission_required',
            isConnected: true,
            statusText: t('status.permissionRequired'),
            shouldShowStatus: true,
            statusColor: '#FF9500',
            statusDotColor: '#FF9500',
            isPulsing: true,
        };
    }

    if (session.thinking === true) {
        return {
            state: 'thinking',
            isConnected: true,
            statusText: options.thinkingStatusText ?? 'thinking…',
            shouldShowStatus: true,
            statusColor: '#007AFF',
            statusDotColor: '#007AFF',
            isPulsing: true,
        };
    }

    return {
        state: 'waiting',
        isConnected: true,
        statusText: t('status.online'),
        shouldShowStatus: false,
        statusColor: '#34C759',
        statusDotColor: '#34C759',
    };
}

export function useSessionStatus(
    session: Session,
    options: Omit<SessionStatusOptions, 'thinkingStatusText'> = {},
): SessionStatus {
    const isOnline = !isSessionInteractionBlocked(session, options) && isSessionLikelyOnline(session);
    const hasPermissions = Boolean(
        session.agentState?.requests && Object.keys(session.agentState.requests).length > 0,
    );

    const vibingMessage = React.useMemo(() => {
        return vibingMessages[Math.floor(Math.random() * vibingMessages.length)].toLowerCase() + '…';
    }, [isOnline, hasPermissions, session.thinking]);

    return getSessionStatus(session, {
        ...options,
        thinkingStatusText: vibingMessage,
    });
}

const vibingMessages = ["Accomplishing", "Actioning", "Actualizing", "Baking", "Booping", "Brewing", "Calculating", "Cerebrating", "Channelling", "Churning", "Clauding", "Coalescing", "Cogitating", "Computing", "Combobulating", "Concocting", "Conjuring", "Considering", "Contemplating", "Cooking", "Crafting", "Creating", "Crunching", "Deciphering", "Deliberating", "Determining", "Discombobulating", "Divining", "Doing", "Effecting", "Elucidating", "Enchanting", "Envisioning", "Finagling", "Flibbertigibbeting", "Forging", "Forming", "Frolicking", "Generating", "Germinating", "Hatching", "Herding", "Honking", "Ideating", "Imagining", "Incubating", "Inferring", "Manifesting", "Marinating", "Meandering", "Moseying", "Mulling", "Mustering", "Musing", "Noodling", "Percolating", "Perusing", "Philosophising", "Pontificating", "Pondering", "Processing", "Puttering", "Puzzling", "Reticulating", "Ruminating", "Scheming", "Schlepping", "Shimmying", "Simmering", "Smooshing", "Spelunking", "Spinning", "Stewing", "Sussing", "Synthesizing", "Thinking", "Tinkering", "Transmuting", "Unfurling", "Unravelling", "Vibing", "Wandering", "Whirring", "Wibbling", "Wizarding", "Working", "Wrangling"];
