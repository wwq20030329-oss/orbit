import type { CliThreadListItem } from '@/utils/cliThreadList';
import type { NavigateToSessionOptions } from '@/hooks/useNavigateToSession';
import { storage } from '@/sync/storage';
import { findExistingOrbitSessionIdForNativeEntry } from '@/utils/nativeCliHistory';
import { isImportedNativeHistoryWrapperSession } from '@/utils/nativeCliSessionResolver';
import { openNativeCliHistoryEntry, prepareNativeCliPlaceholderSession, primeNativeCliHistoryEntryOpen } from '@/utils/openNativeCliSession';

export interface CliThreadNavigationActions {
    navigateToSession: (sessionId: string, options?: NavigateToSessionOptions) => Promise<void>;
    navigateDirectlyToSession: (sessionId: string) => void;
}

export async function openCliThreadItem(
    item: CliThreadListItem,
    actions: CliThreadNavigationActions,
): Promise<void> {
    if (item.source === 'session' && item.session) {
        await actions.navigateToSession(item.session.id, item.session.metadata?.lifecycleState === 'archived'
            ? { preferHistoryEntry: true }
            : undefined);
        return;
    }

    if (!item.entry) {
        return;
    }

    const interactiveSessionId = findExistingOrbitSessionIdForNativeEntry(
        item.entry,
        storage.getState().sessions,
        { allowOffline: false },
    );

    if (interactiveSessionId) {
        actions.navigateDirectlyToSession(interactiveSessionId);
        return;
    }

    const placeholderSessionId = findExistingOrbitSessionIdForNativeEntry(
        item.entry,
        storage.getState().sessions,
        { allowOffline: true },
    );

    if (placeholderSessionId) {
        const placeholderSession = storage.getState().sessions[placeholderSessionId];
        const shouldOpenPlaceholderImmediately = placeholderSession
            ? isImportedNativeHistoryWrapperSession(placeholderSession)
            : false;

        if (!shouldOpenPlaceholderImmediately) {
            void primeNativeCliHistoryEntryOpen(item.entry).catch((error) => {
                console.warn('Failed to prime native CLI history session from list open', error);
            });
            actions.navigateDirectlyToSession(item.entry.id);
            return;
        }

        prepareNativeCliPlaceholderSession(placeholderSessionId, item.entry);
        actions.navigateDirectlyToSession(placeholderSessionId);

        void openNativeCliHistoryEntry(item.entry)
            .then((resolvedSessionId) => {
                if (resolvedSessionId && resolvedSessionId !== placeholderSessionId) {
                    actions.navigateDirectlyToSession(resolvedSessionId);
                }
            })
            .catch((error) => {
                console.warn('Failed to warm native CLI history session from list open', error);
            });
        return;
    }

    void primeNativeCliHistoryEntryOpen(item.entry).catch((error) => {
        console.warn('Failed to prime native CLI history session from list open', error);
    });
    actions.navigateDirectlyToSession(item.entry.id);
}
