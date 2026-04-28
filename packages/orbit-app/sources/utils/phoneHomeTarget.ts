import type { SessionListViewItem } from '@/sync/storage';
import type { NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

export interface PhoneHomeTarget {
    identifier: string;
    title: string;
    subtitle: string | null;
    source: 'session' | 'native';
}

function getSessionTitle(session: Session): string {
    return session.metadata?.summary?.text
        || session.metadata?.name
        || 'CLI Session';
}

function getSessionSubtitle(session: Session): string | null {
    return session.metadata?.path
        || session.metadata?.projectRoot
        || null;
}

function getNativeEntrySubtitle(entry: NativeCliHistoryEntry): string | null {
    return entry.workingDirectory || entry.projectRoot || null;
}

export function getDefaultPhoneHomeTarget(
    data: SessionListViewItem[] | null,
): PhoneHomeTarget | null {
    if (!data || data.length === 0) {
        return null;
    }

    for (const item of data) {
        if (item.type === 'session') {
            return {
                identifier: item.session.id,
                source: 'session',
                title: item.displayTitle || getSessionTitle(item.session),
                subtitle: item.displaySubtitle || getSessionSubtitle(item.session),
            };
        }

        if (item.type === 'native-cli-session') {
            return {
                identifier: item.entry.id,
                source: 'native',
                title: item.displayTitle || item.entry.title,
                subtitle: item.displaySubtitle || getNativeEntrySubtitle(item.entry),
            };
        }
    }

    return null;
}
