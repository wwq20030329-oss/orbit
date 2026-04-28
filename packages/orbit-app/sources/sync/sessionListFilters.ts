import type { Session } from './storageTypes';

export function isCliSessionRelevantForList(session: Session): boolean {
    const metadata = session.metadata;
    if (!metadata) {
        return false;
    }

    if (metadata.sessionRole === 'native-live-mirror') {
        return false;
    }

    return Boolean(
        metadata.claudeSessionId
        || metadata.codexThreadId
        || metadata.geminiSessionId
        || (
            metadata.nativeHistorySourceTool
            && metadata.nativeHistorySourceBackendId
        ),
    );
}
