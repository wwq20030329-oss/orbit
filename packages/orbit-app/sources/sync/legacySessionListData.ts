import { isSessionLikelyOnline } from '@/utils/presence';

import type { Session } from './storageTypes';

export type LegacySessionListItem = 'online' | 'offline' | Session;

type PartitionedLegacySessions = {
    activeSessions: Session[];
    inactiveSessions: Session[];
};

function partitionLegacySessions(sessions: Session[]): PartitionedLegacySessions {
    const activeSessions: Session[] = [];
    const inactiveSessions: Session[] = [];

    sessions.forEach((session) => {
        if (isSessionLikelyOnline(session)) {
            activeSessions.push(session);
            return;
        }

        inactiveSessions.push(session);
    });

    activeSessions.sort((left, right) => right.createdAt - left.createdAt);
    inactiveSessions.sort((left, right) => right.createdAt - left.createdAt);

    return {
        activeSessions,
        inactiveSessions,
    };
}

export function buildLegacySessionListData(
    sessions: Session[],
): LegacySessionListItem[] {
    const { activeSessions, inactiveSessions } = partitionLegacySessions(sessions);
    const listData: LegacySessionListItem[] = [];

    if (activeSessions.length > 0) {
        listData.push('online');
        listData.push(...activeSessions);
    }

    if (inactiveSessions.length > 0) {
        listData.push('offline');
        listData.push(...inactiveSessions);
    }

    return listData;
}
