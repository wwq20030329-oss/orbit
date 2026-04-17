import type { Session } from './storageTypes';
import type { SessionControlState } from '@/utils/sessionControlState';

function hasDirectNativeRuntime(session: Session): boolean {
    return Boolean(
        session.metadata?.claudeSessionId
        || session.metadata?.codexThreadId
        || session.metadata?.geminiSessionId,
    );
}

export function shouldRefreshSessionsOnVisible(
    session: Session | null | undefined,
    sessionControlState: SessionControlState | null | undefined,
): boolean {
    if (!session || !sessionControlState) {
        return false;
    }

    if (session.metadata?.lifecycleState !== 'running') {
        return false;
    }

    if (!hasDirectNativeRuntime(session)) {
        return false;
    }

    return sessionControlState.isDisconnected;
}
