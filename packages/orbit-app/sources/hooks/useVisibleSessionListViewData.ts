import * as React from 'react';
import { SessionListViewItem, storage, useAllMachines, useCliSessionsForList, useLocalSetting, useNativeCliHistoryByMachine } from '@/sync/storage';
import type { Machine } from '@/sync/storageTypes';
import { ensureNativeCliHistoryLoadedForMachines } from '@/utils/nativeCliHistoryRefresh';
import { getNativeCliEntrySourceKeyForSession } from '@/utils/nativeCliHistory';
import { isMachineOnline } from '@/utils/machineUtils';

function getPreferredVisibleMachineIds(
    machines: Machine[],
): Set<string> {
    const activeMachineIds = machines
        .filter((machine) => isMachineOnline(machine))
        .map((machine) => machine.id);

    if (activeMachineIds.length > 0) {
        return new Set(activeMachineIds);
    }

    return new Set(machines.map((machine) => machine.id));
}

export function useVisibleSessionListViewData(): SessionListViewItem[] | null {
    const isDataReady = storage((state) => state.isDataReady);
    const sessions = useCliSessionsForList();
    const hiddenNativeCliEntries = useLocalSetting('hiddenNativeCliEntries');
    const machines = useAllMachines({ includeOffline: true });
    const nativeCliHistoryByMachine = useNativeCliHistoryByMachine();
    const deferredSessions = React.useDeferredValue(sessions);
    const deferredMachines = React.useDeferredValue(machines);
    const deferredNativeCliHistoryByMachine = React.useDeferredValue(nativeCliHistoryByMachine);

    React.useEffect(() => {
        void ensureNativeCliHistoryLoadedForMachines(machines);
    }, [machines]);

    return React.useMemo(() => {
        if (!isDataReady) {
            return null;
        }

        const knownMachineIds = getPreferredVisibleMachineIds(deferredMachines);
        const allNativeEntries = Object.entries(deferredNativeCliHistoryByMachine)
            .filter(([machineId]) => knownMachineIds.has(machineId))
            .flatMap(([, entries]) => entries)
            .sort((left, right) => right.updatedAt - left.updatedAt);

        const visibleNativeEntries = allNativeEntries;

        const hiddenEntryKeys = new Set(Object.keys(hiddenNativeCliEntries));
        const visibleSessions = deferredSessions.filter((session) => {
            const sessionMachineId = session.metadata?.machineId;
            if (sessionMachineId && !knownMachineIds.has(sessionMachineId)) {
                return false;
            }

            const sourceKey = getNativeCliEntrySourceKeyForSession(session);
            return !sourceKey || !hiddenEntryKeys.has(sourceKey);
        });

        const visibleItems: Array<
            Extract<SessionListViewItem, { type: 'native-cli-session' }>
            | Extract<SessionListViewItem, { type: 'session' }>
        > = [
            ...visibleNativeEntries.map((entry) => ({
                type: 'native-cli-session' as const,
                entry,
            })),
            ...visibleSessions.map((session) => ({
                type: 'session' as const,
                session,
            })),
        ];

        visibleItems.sort((left, right) => {
            const leftUpdatedAt = left.type === 'session' ? left.session.updatedAt : left.entry.updatedAt;
            const rightUpdatedAt = right.type === 'session' ? right.session.updatedAt : right.entry.updatedAt;
            return rightUpdatedAt - leftUpdatedAt;
        });

        return visibleItems;
    }, [
        deferredMachines,
        deferredNativeCliHistoryByMachine,
        deferredSessions,
        hiddenNativeCliEntries,
        isDataReady,
    ]);
}
