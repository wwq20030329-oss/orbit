import React from 'react';

import { machineListNativeCliHistory } from '@/sync/ops';
import { storage } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';

const nativeCliHistoryInFlight = new Map<string, Promise<NativeCliHistoryEntry[]>>();
const nativeCliHistoryLoadedAt = new Map<string, number>();

function isNativeCliHistoryUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalizedMessage = message.trim().toLowerCase();
    return normalizedMessage.includes('native cli history is unavailable on this machine')
        || normalizedMessage.includes('rpcmethodnotavailable')
        || normalizedMessage.includes('rpc method not available')
        || normalizedMessage.includes('method not available');
}

function canRefreshNativeCliHistory(machine: Machine | null | undefined): machine is Machine {
    if (!machine || !isMachineOnline(machine)) {
        return false;
    }

    const availability = machine.metadata?.cliAvailability;
    if (!availability) {
        return false;
    }

    return availability.claude || availability.codex || availability.gemini;
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

    if (!canRefreshNativeCliHistory(machine)) {
        return existingEntries;
    }

    const hasLoaded = hasLoadedNativeCliHistoryForMachine(machineId);
    if (!options.force && hasLoaded) {
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
            if (!hasLoaded) {
                nativeCliHistoryLoadedAt.set(machineId, Date.now());
            }
            if (isNativeCliHistoryUnavailableError(error)) {
                return existingEntries;
            }
            throw error;
        })
        .finally(() => {
            nativeCliHistoryInFlight.delete(machineId);
        });

    nativeCliHistoryInFlight.set(machineId, request);
    return request;
}

export async function ensureNativeCliHistoryLoadedForMachines(machines: Machine[]): Promise<void> {
    await Promise.all(
        machines
            .filter((machine) => canRefreshNativeCliHistory(machine) && !hasLoadedNativeCliHistoryForMachine(machine.id))
            .map((machine) => refreshNativeCliHistoryForMachine(machine.id)),
    );
}
