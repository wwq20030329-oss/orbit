import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { SessionListViewItem } from '@/sync/storage';
import { retainVisibleSessionListObserver, storage } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';
import {
    ensureNativeCliHistoryLoadedForMachines,
    type NativeCliHistoryLoadTarget,
} from '@/utils/nativeCliHistoryRefresh';
import { isMachineOnline } from '@/utils/machineUtils';

export type VisibleSessionListViewItem = Extract<
    SessionListViewItem,
    { type: 'native-cli-session' } | { type: 'session' }
>;

const EMPTY_SESSIONS: Session[] = [];
const EMPTY_MACHINE_IDS: string[] = [];
const EMPTY_NATIVE_CLI_HISTORY_LIST: NativeCliHistoryEntry[] = [];
const EMPTY_NATIVE_CLI_HISTORY_LISTS: NativeCliHistoryEntry[][] = [];

type VisibleMachineStatus = {
    id: string;
    online: boolean;
    hasNativeCliHistory: boolean;
};

function buildVisibleMachineStatusKey(machine: Machine): string {
    const cliAvailability = machine.metadata?.cliAvailability;
    return [
        machine.id,
        isMachineOnline(machine) ? '1' : '0',
        cliAvailability?.claude ? '1' : '0',
        cliAvailability?.codex ? '1' : '0',
        cliAvailability?.gemini ? '1' : '0',
    ].join(':');
}

function parseVisibleMachineStatusKey(key: string): VisibleMachineStatus {
    const [id = '', online = '0', claude = '0', codex = '0', gemini = '0'] = key.split(':');
    return {
        id,
        online: online === '1',
        hasNativeCliHistory: claude === '1' || codex === '1' || gemini === '1',
    };
}

function getPreferredVisibleMachineIds(
    machines: VisibleMachineStatus[],
    includeAllMachines: boolean,
): string[] {
    if (includeAllMachines) {
        return machines.map((machine) => machine.id);
    }

    const activeMachineIds = machines
        .filter((machine) => machine.online)
        .map((machine) => machine.id);

    if (activeMachineIds.length > 0) {
        return activeMachineIds;
    }

    return machines.map((machine) => machine.id);
}

function mergeVisibleItems(
    nativeEntries: NativeCliHistoryEntry[],
    sessions: Session[],
): VisibleSessionListViewItem[] {
    const merged: VisibleSessionListViewItem[] = [];
    let nativeIndex = 0;
    let sessionIndex = 0;

    while (nativeIndex < nativeEntries.length && sessionIndex < sessions.length) {
        const nativeEntry = nativeEntries[nativeIndex];
        const session = sessions[sessionIndex];
        if (nativeEntry.updatedAt >= session.updatedAt) {
            merged.push({
                type: 'native-cli-session',
                entry: nativeEntry,
            });
            nativeIndex += 1;
            continue;
        }

        merged.push({
            type: 'session',
            session,
        });
        sessionIndex += 1;
    }

    while (nativeIndex < nativeEntries.length) {
        merged.push({
            type: 'native-cli-session',
            entry: nativeEntries[nativeIndex],
        });
        nativeIndex += 1;
    }

    while (sessionIndex < sessions.length) {
        merged.push({
            type: 'session',
            session: sessions[sessionIndex],
        });
        sessionIndex += 1;
    }

    return merged;
}

function isUpdatedAtDescending(entries: readonly NativeCliHistoryEntry[]): boolean {
    for (let index = 1; index < entries.length; index += 1) {
        if ((entries[index - 1]?.updatedAt ?? 0) < (entries[index]?.updatedAt ?? 0)) {
            return false;
        }
    }

    return true;
}

export function mergeVisibleNativeCliHistoryLists(
    lists: readonly NativeCliHistoryEntry[][],
): NativeCliHistoryEntry[] {
    if (lists.length === 0) {
        return EMPTY_NATIVE_CLI_HISTORY_LIST;
    }

    if (lists.length === 1) {
        const [onlyList] = lists;
        if (!onlyList || onlyList.length === 0) {
            return EMPTY_NATIVE_CLI_HISTORY_LIST;
        }

        if (isUpdatedAtDescending(onlyList)) {
            return onlyList;
        }

        return [...onlyList].sort((left, right) => right.updatedAt - left.updatedAt);
    }

    const allListsAreSorted = lists.every(isUpdatedAtDescending);
    if (!allListsAreSorted) {
        const flattenedEntries: NativeCliHistoryEntry[] = [];
        for (const entries of lists) {
            flattenedEntries.push(...entries);
        }

        flattenedEntries.sort((left, right) => right.updatedAt - left.updatedAt);
        return flattenedEntries;
    }

    const mergedEntries: NativeCliHistoryEntry[] = [];
    const indices = new Array(lists.length).fill(0);

    while (true) {
        let nextListIndex = -1;
        let nextEntry: NativeCliHistoryEntry | null = null;

        for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
            const entryIndex = indices[listIndex] ?? 0;
            const candidate = lists[listIndex]?.[entryIndex];
            if (!candidate) {
                continue;
            }

            if (!nextEntry || candidate.updatedAt > nextEntry.updatedAt) {
                nextEntry = candidate;
                nextListIndex = listIndex;
            }
        }

        if (nextListIndex < 0 || !nextEntry) {
            break;
        }

        mergedEntries.push(nextEntry);
        indices[nextListIndex] = (indices[nextListIndex] ?? 0) + 1;
    }

    return mergedEntries;
}

export function useVisibleSessionListViewData(options: {
    prioritizeFreshness?: boolean;
    includeAllMachines?: boolean;
    includeNativeCliHistory?: boolean;
    enabled?: boolean;
} = {}): VisibleSessionListViewItem[] | null {
    const prioritizeFreshness = options.prioritizeFreshness ?? false;
    const includeAllMachines = options.includeAllMachines ?? false;
    const includeNativeCliHistory = options.includeNativeCliHistory ?? true;
    const enabled = options.enabled ?? true;
    const lastComputedDataRef = React.useRef<VisibleSessionListViewItem[] | null>(null);
    const isDataReady = storage(useShallow((state) => (enabled ? state.isDataReady : false)));
    const machineStatusKeys = storage(useShallow((state) => {
        if (!enabled) {
            return EMPTY_MACHINE_IDS;
        }

        return state.listMachines.map(buildVisibleMachineStatusKey);
    }));
    const machineStatuses = React.useMemo<VisibleMachineStatus[]>(
        () => machineStatusKeys.map(parseVisibleMachineStatusKey),
        [machineStatusKeys],
    );
    const preferredVisibleMachineIds = React.useMemo(
        () => getPreferredVisibleMachineIds(machineStatuses, includeAllMachines),
        [includeAllMachines, machineStatuses],
    );
    const preferredVisibleMachineIdSet = React.useMemo(
        () => new Set(preferredVisibleMachineIds),
        [preferredVisibleMachineIds],
    );
    const preferredVisibleMachines = React.useMemo<NativeCliHistoryLoadTarget[]>(
        () => machineStatuses
            .filter((machine) => preferredVisibleMachineIdSet.has(machine.id))
            .map((machine) => ({
                id: machine.id,
                online: machine.online,
                hasNativeCliHistory: machine.hasNativeCliHistory,
            })),
        [machineStatuses, preferredVisibleMachineIdSet],
    );
    const nativeCliHistoryLoadTargets = React.useMemo<NativeCliHistoryLoadTarget[]>(
        () => preferredVisibleMachines.filter((machine) => machine.online && machine.hasNativeCliHistory),
        [preferredVisibleMachines],
    );
    const visibleSessions = storage(useShallow((state) => {
        if (!enabled) {
            return EMPTY_SESSIONS;
        }

        return state.cliListSessions.filter((session) => {
            const sessionMachineId = session.metadata?.machineId;
            if (sessionMachineId && !preferredVisibleMachineIdSet.has(sessionMachineId)) {
                return false;
            }

            return true;
        });
    }));
    void prioritizeFreshness;
    const effectiveSessions = visibleSessions;
    const visibleNativeCliHistoryLists = storage(useShallow((state) => {
        if (!enabled || !includeNativeCliHistory) {
            return EMPTY_NATIVE_CLI_HISTORY_LISTS;
        }

        return preferredVisibleMachineIds.map(
            (machineId) => state.nativeCliHistoryByMachine[machineId] ?? EMPTY_NATIVE_CLI_HISTORY_LIST,
        );
    }));
    const effectiveNativeCliHistoryLists = visibleNativeCliHistoryLists;
    const visibleNativeEntries = React.useMemo(
        () => mergeVisibleNativeCliHistoryLists(effectiveNativeCliHistoryLists),
        [effectiveNativeCliHistoryLists],
    );

    React.useEffect(() => {
        if (!enabled) {
            return;
        }

        return retainVisibleSessionListObserver();
    }, [enabled]);

    React.useEffect(() => {
        if (!enabled || !includeNativeCliHistory) {
            return;
        }

        void ensureNativeCliHistoryLoadedForMachines(nativeCliHistoryLoadTargets);
    }, [enabled, includeNativeCliHistory, nativeCliHistoryLoadTargets]);

    const visibleItems = React.useMemo(() => {
        if (!enabled) {
            return lastComputedDataRef.current;
        }

        if (!isDataReady) {
            return null;
        }
        return mergeVisibleItems(visibleNativeEntries, effectiveSessions);
    }, [
        enabled,
        effectiveSessions,
        isDataReady,
        visibleNativeEntries,
    ]);

    React.useEffect(() => {
        if (enabled && visibleItems !== null) {
            lastComputedDataRef.current = visibleItems;
        }
    }, [enabled, visibleItems]);

    return visibleItems;
}
