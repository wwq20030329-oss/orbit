import type { NativeCliHistoryEntry } from './storageTypes';

export function areNativeCliEntriesEqual(
    left: NativeCliHistoryEntry[] | undefined,
    right: NativeCliHistoryEntry[],
): boolean {
    if (!left || left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (!leftEntry || !rightEntry) {
            return false;
        }

        if (
            leftEntry.id !== rightEntry.id
            || leftEntry.backendId !== rightEntry.backendId
            || leftEntry.updatedAt !== rightEntry.updatedAt
            || leftEntry.isLive !== rightEntry.isLive
            || leftEntry.title !== rightEntry.title
            || leftEntry.summary !== rightEntry.summary
            || leftEntry.workingDirectory !== rightEntry.workingDirectory
            || leftEntry.projectRoot !== rightEntry.projectRoot
        ) {
            return false;
        }
    }

    return true;
}
