import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => {
  const state = {
    machines: {} as Record<string, Machine>,
    nativeCliHistoryByMachine: {} as Record<string, NativeCliHistoryEntry[]>,
    applyNativeCliHistory: vi.fn((machineId: string, entries: NativeCliHistoryEntry[]) => {
      state.nativeCliHistoryByMachine[machineId] = entries;
    }),
  };

  return {
    state,
    machineListNativeCliHistory: vi.fn(),
  };
});

vi.mock('@/sync/ops', () => ({
  machineListNativeCliHistory: hoisted.machineListNativeCliHistory,
}));

vi.mock('@/sync/storage', () => ({
  storage: {
    getState: () => hoisted.state,
  },
}));

import {
  hasLoadedNativeCliHistoryForMachine,
  invalidateNativeCliHistoryForMachines,
  refreshNativeCliHistoryForMachine,
} from './nativeCliHistoryRefresh';

function createMachine(id: string, overrides: Partial<Machine> = {}): Machine {
  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: true,
    activeAt: Date.now(),
    metadata: {
      host: 'wwq-mac',
      platform: 'darwin',
      orbitCliVersion: '1.0.0',
      orbitHomeDir: '/Users/test/.orbit',
      homeDir: '/Users/test',
      cliAvailability: {
        claude: false,
        codex: true,
        gemini: false,
        openclaw: false,
        detectedAt: Date.now(),
      },
      ...overrides.metadata,
    },
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 0,
    ...overrides,
  };
}

describe('nativeCliHistoryRefresh', () => {
  const machineId = 'machine-1';
  const firstEntries: NativeCliHistoryEntry[] = [
    {
      id: 'codex:thread-1',
      tool: 'codex',
      backendId: 'thread-1',
      machineId,
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 100,
      isLive: false,
    },
  ];

  const secondEntries: NativeCliHistoryEntry[] = [
    {
      ...firstEntries[0]!,
      updatedAt: 200,
      isLive: true,
    },
  ];

  beforeEach(() => {
    invalidateNativeCliHistoryForMachines();
    hoisted.machineListNativeCliHistory.mockReset();
    hoisted.state.applyNativeCliHistory.mockClear();
    hoisted.state.machines = {
      [machineId]: createMachine(machineId),
    };
    hoisted.state.nativeCliHistoryByMachine = {};
  });

  it('keeps using cached history until invalidated', async () => {
    hoisted.machineListNativeCliHistory.mockResolvedValueOnce(firstEntries);

    const initial = await refreshNativeCliHistoryForMachine(machineId);
    const cached = await refreshNativeCliHistoryForMachine(machineId);

    expect(initial[0]?.updatedAt).toBe(100);
    expect(cached[0]?.updatedAt).toBe(100);
    expect(hoisted.machineListNativeCliHistory).toHaveBeenCalledTimes(1);
    expect(hasLoadedNativeCliHistoryForMachine(machineId)).toBe(true);
  });

  it('reloads machine history after invalidation', async () => {
    hoisted.machineListNativeCliHistory
      .mockResolvedValueOnce(firstEntries)
      .mockResolvedValueOnce(secondEntries);

    await refreshNativeCliHistoryForMachine(machineId);
    invalidateNativeCliHistoryForMachines([machineId]);
    const refreshed = await refreshNativeCliHistoryForMachine(machineId);

    expect(refreshed[0]?.updatedAt).toBe(200);
    expect(refreshed[0]?.isLive).toBe(true);
    expect(hoisted.machineListNativeCliHistory).toHaveBeenCalledTimes(2);
  });

  it('falls back to cached history when native CLI history RPC is unavailable', async () => {
    hoisted.state.nativeCliHistoryByMachine = {
      [machineId]: firstEntries,
    };
    hoisted.machineListNativeCliHistory.mockRejectedValueOnce(
      new Error('rpcmethodnotavailable'),
    );

    const refreshed = await refreshNativeCliHistoryForMachine(machineId, { force: true });

    expect(refreshed).toEqual(firstEntries);
    expect(hoisted.state.applyNativeCliHistory).not.toHaveBeenCalled();
    expect(hasLoadedNativeCliHistoryForMachine(machineId)).toBe(true);
  });
});
