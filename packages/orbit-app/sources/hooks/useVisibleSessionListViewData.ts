import * as React from 'react';
import { SessionListViewItem, storage, useAllMachines, useNativeCliHistoryByMachine, useSessionListViewData, useSetting } from '@/sync/storage';
import { machineListNativeCliHistory } from '@/sync/ops';
import { isMachineOnline } from '@/utils/machineUtils';
import { appendNativeCliHistoryToSessionList } from '@/utils/nativeCliHistory';

const nativeCliHistoryInFlight = new Set<string>();
const nativeCliHistoryLastFetchedAt = new Map<string, number>();
const NATIVE_CLI_HISTORY_REFRESH_MS = 30_000;

export function useVisibleSessionListViewData(): SessionListViewItem[] | null {
    const data = useSessionListViewData();
    const hideInactiveSessions = useSetting('hideInactiveSessions');
    const machines = useAllMachines({ includeOffline: true });
    const nativeCliHistoryByMachine = useNativeCliHistoryByMachine();

    React.useEffect(() => {
        const onlineMachines = machines.filter((machine) => isMachineOnline(machine));

        for (const machine of onlineMachines) {
            if (!machine.metadata?.cliAvailability) {
                continue;
            }

            const hasSupportedCli = machine.metadata.cliAvailability.claude
                || machine.metadata.cliAvailability.codex
                || machine.metadata.cliAvailability.gemini;
            if (!hasSupportedCli) {
                continue;
            }

            const lastFetchedAt = nativeCliHistoryLastFetchedAt.get(machine.id) ?? 0;
            const isFresh = Date.now() - lastFetchedAt < NATIVE_CLI_HISTORY_REFRESH_MS;
            if (isFresh || nativeCliHistoryInFlight.has(machine.id)) {
                continue;
            }

            nativeCliHistoryInFlight.add(machine.id);
            void machineListNativeCliHistory(machine.id)
                .then((entries) => {
                    nativeCliHistoryLastFetchedAt.set(machine.id, Date.now());
                    storage.getState().applyNativeCliHistory(machine.id, entries.map((entry) => ({
                        ...entry,
                        machineId: machine.id,
                    })));
                })
                .catch(() => {
                    nativeCliHistoryLastFetchedAt.set(machine.id, Date.now());
                })
                .finally(() => {
                    nativeCliHistoryInFlight.delete(machine.id);
                });
        }
    }, [machines]);

    return React.useMemo(() => {
        if (!data) {
            return data;
        }

        const baseItems = hideInactiveSessions ? filterInactiveSessions(data) : data;
        const onlineMachineIds = new Set(
            machines.filter((machine) => isMachineOnline(machine)).map((machine) => machine.id),
        );

        const nativeEntries = Object.entries(nativeCliHistoryByMachine)
            .filter(([machineId]) => onlineMachineIds.has(machineId))
            .flatMap(([, entries]) => entries)
            .sort((left, right) => right.updatedAt - left.updatedAt);

        const machinesById = Object.fromEntries(
            machines.map((machine) => [machine.id, machine]),
        );

        return appendNativeCliHistoryToSessionList(baseItems, nativeEntries, machinesById);
    }, [data, hideInactiveSessions, machines, nativeCliHistoryByMachine]);
}

function filterInactiveSessions(data: SessionListViewItem[]): SessionListViewItem[] {
    const filtered: SessionListViewItem[] = [];
    let pendingProjectGroup: SessionListViewItem | null = null;

    for (const item of data) {
        if (item.type === 'project-group') {
            pendingProjectGroup = item;
            continue;
        }

        if (item.type === 'session') {
            if (item.session.active) {
                if (pendingProjectGroup) {
                    filtered.push(pendingProjectGroup);
                    pendingProjectGroup = null;
                }
                filtered.push(item);
            }
            continue;
        }

        pendingProjectGroup = null;

        if (item.type === 'active-sessions') {
            filtered.push(item);
        }
    }

    return filtered;
}
