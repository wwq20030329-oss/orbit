import type { Session } from '@/sync/storageTypes';

import { shouldAutoResolveNativeCliSession } from './nativeCliSessionResolver';
import { isSessionOpenedAsHistoryOnly } from './openNativeCliSession';

export interface SessionInteractionOptions {
    sessionId?: string;
    interactionBlocked?: boolean;
}

export function isSessionInteractionBlocked(
    session: Session,
    options: SessionInteractionOptions = {},
): boolean {
    if (typeof options.interactionBlocked === 'boolean') {
        return options.interactionBlocked;
    }

    const openedAsHistoryOnly = options.sessionId
        ? isSessionOpenedAsHistoryOnly(options.sessionId)
        : false;

    return openedAsHistoryOnly || shouldAutoResolveNativeCliSession(session);
}
