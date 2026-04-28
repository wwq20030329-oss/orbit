import React from 'react';

import { machineListNativeCliHistory } from '@/sync/ops';
import { storage } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';

const nativeCliHistoryInFlight = new Map<string, Promise<NativeCliHistoryEntry[]>>();
const nativeCliHistoryLoadedAt = new Map<string, number>();
const NATIVE_CLI_HISTORY_STALE_MS = 30_000;

export type NativeCliHistoryLoadTarget = {
    id: string;
    online: boolean;
    hasNativeCliHistory: boolean;
};

function isNativeCliHistoryUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalizedMessage = message.trim().toLowerCase();
    return normalizedMessage.includes('native cli history is unavailable on this machine')
        || normalizedMessage.includes('rpcmethodnotavailable')
        || normalizedMessage.includes('rpc method not available')
        || normalizedMessage.includes('method not available');
}

function canRefreshNativeCliHistory(machine: NativeCliHistoryLoadTarget | null | undefined): machine is NativeCliHistoryLoadTarget {
    if (!machine || !machine.online) {
        return false;
    }
    return machine.hasNativeCliHistory;
}

function resolveNativeCliHistoryLoadTarget(machine: Machine | null | undefined): NativeCliHistoryLoadTarget | null {
    if (!machine) {
        return null;
    }

    const availability = machine.metadata?.cliAvailability;
    return {
        id: machine.id,
        online: isMachineOnline(machine),
        hasNativeCliHistory: Boolean(availability?.claude || availability?.codex || availability?.gemini),
    };
}

function withMachineId(machineId: string, entries: NativeCliHistoryEntry[]): NativeCliHistoryEntry[] {
    return entries.map((entry) => ({
        ...entry,
        machineId,
    }));
}

export function hasLoadedNativeCliHistoryForMachine(machineId: string): boolean {
    return nativeCliHistoryLoadedAt.has(machineId);
}

function shouldRefreshNativeCliHistory(machineId: string, force: boolean | undefined): boolean {
    if (force) {
        return true;
    }

    const loadedAt = nativeCliHistoryLoadedAt.get(machineId);
    if (loadedAt === undefined) {
        return true;
    }

    return Date.now() - loadedAt > NATIVE_CLI_HISTORY_STALE_MS;
}

export function invalidateNativeCliHistoryForMachines(machineIds?: Iterable<string>): void {
    if (!machineIds) {
        nativeCliHistoryLoadedAt.clear();
        return;
    }

    for (const machineId of machineIds) {
        nativeCliHistoryLoadedAt.delete(machineId);
    }
}

export async function refreshNativeCliHistoryForMachine(
    machineId: string,
    options: { force?: boolean } = {},
): Promise<NativeCliHistoryEntry[]> {
    const machine = storage.getState().machines[machineId];
    const existingEntries = storage.getState().nativeCliHistoryByMachine[machineId] ?? [];

    if (!canRefreshNativeCliHistory(resolveNativeCliHistoryLoadTarget(machine))) {
        return existingEntries;
    }

    const hasLoaded = hasLoadedNativeCliHistoryForMachine(machineId);
    if (!shouldRefreshNativeCliHistory(machineId, options.force)) {
        return existingEntries;
    }

    const inFlight = nativeCliHistoryInFlight.get(machineId);
    if (inFlight) {
        return inFlight;
    }

    const request = machineListNativeCliHistory(machineId)
        .then((entries) => {
            const entriesForMachine = withMachineId(machineId, entries);
            nativeCliHistoryLoadedAt.set(machineId, Date.now());
            React.startTransition(() => {
                storage.getState().applyNativeCliHistory(machineId, entriesForMachine);
            });
            return entriesForMachine;
        })
        .catch((error) => {
            if (isNativeCliHistoryUnavailableError(error)) {
                nativeCliHistoryLoadedAt.set(machineId, Date.now());
                return existingEntries;
            }
            if (!hasLoaded) {
                nativeCliHistoryLoadedAt.set(machineId, Date.now());
            }
            throw error;
        })
        .finally(() => {
            nativeCliHistoryInFlight.delete(machineId);
        });

    nativeCliHistoryInFlight.set(machineId, request);
    return request;
}

export async function ensureNativeCliHistoryLoadedForMachines(machines: NativeCliHistoryLoadTarget[]): Promise<void> {
    await Promise.all(
        machines
            .filter((machine) => canRefreshNativeCliHistory(machine) && shouldRefreshNativeCliHistory(machine.id, false))
            .map((machine) => refreshNativeCliHistoryForMachine(machine.id)),
    );
}
