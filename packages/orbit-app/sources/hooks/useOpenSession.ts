import * as React from 'react';

import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import type { Session } from '@/sync/storageTypes';

export function useOpenSession(session: Session) {
    const navigateToSession = useNavigateToSession();

    const [opening, openSession] = useOrbitAction(async () => {
        await navigateToSession(session.id);
    });

    return { opening, openSession };
}
