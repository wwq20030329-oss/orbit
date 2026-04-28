import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleRealtimeMachineActivityUpdate,
  handleRealtimeNewMachineUpdate,
  handleRealtimeUpdateMachineState,
  type MachineRealtimeUpdateDependencies,
} from './machineRealtimeUpdate';
import type { Machine } from './storageTypes';

function createMachine(id: string): Machine {
  return {
    id,
    seq: 1,
    createdAt: 10,
    updatedAt: 20,
    active: true,
    activeAt: 20,
    metadata: { host: 'host', platform: 'darwin', orbitCliVersion: '1.0.0', orbitHomeDir: '/orbit', homeDir: '/Users/test' },
    metadataVersion: 1,
    daemonState: { status: 'running' },
    daemonStateVersion: 1,
  };
}

function createDeps(): MachineRealtimeUpdateDependencies {
  return {
    ensureMachineEncryption: vi.fn(async () => ({
      decryptMetadata: vi.fn(async () => ({
        host: 'updated-host',
        platform: 'darwin',
        orbitCliVersion: '1.1.0',
        orbitHomeDir: '/orbit',
        homeDir: '/Users/test',
      })),
      decryptDaemonState: vi.fn(async () => ({ status: 'idle' })),
    })),
    getMachine: vi.fn((machineId: string) => (machineId === 'machine-1' ? createMachine(machineId) : undefined)),
    applyMachines: vi.fn(),
    invalidateMachines: vi.fn(),
  };
}

describe('machineRealtimeUpdate', () => {
  let deps: MachineRealtimeUpdateDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it('applies a decrypted new machine update', async () => {
    const update: Parameters<typeof handleRealtimeNewMachineUpdate>[0] = {
      id: 'u1',
      seq: 5,
      createdAt: 500,
      body: {
        t: 'new-machine',
        machineId: 'machine-2',
        seq: 5,
        metadata: 'encrypted-metadata',
        metadataVersion: 2,
        daemonState: 'encrypted-daemon-state',
        daemonStateVersion: 3,
        dataEncryptionKey: 'encrypted-key',
        active: false,
        activeAt: 450,
        createdAt: 400,
        updatedAt: 500,
      },
    };

    await handleRealtimeNewMachineUpdate(update, deps);

    expect(deps.ensureMachineEncryption).toHaveBeenCalledWith('machine-2', 'encrypted-key');
    expect(deps.applyMachines).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'machine-2',
        seq: 5,
        createdAt: 400,
        updatedAt: 500,
        active: false,
        activeAt: 450,
        metadataVersion: 2,
        daemonStateVersion: 3,
      }),
    ]);
  });

  it('refreshes machines when a new-machine update arrives before encryption is ready', async () => {
    vi.mocked(deps.ensureMachineEncryption).mockResolvedValueOnce(null);

    const update: Parameters<typeof handleRealtimeNewMachineUpdate>[0] = {
      id: 'u2',
      seq: 6,
      createdAt: 600,
      body: {
        t: 'new-machine',
        machineId: 'machine-3',
        seq: 6,
        metadata: 'encrypted-metadata',
        metadataVersion: 2,
        daemonState: null,
        daemonStateVersion: 0,
        dataEncryptionKey: 'encrypted-key',
        active: true,
        activeAt: 600,
        createdAt: 600,
        updatedAt: 600,
      },
    };

    await handleRealtimeNewMachineUpdate(update, deps);

    expect(deps.invalidateMachines).toHaveBeenCalledTimes(1);
    expect(deps.applyMachines).not.toHaveBeenCalled();
  });

  it('merges update-machine payloads onto the current machine state', async () => {
    const update: Parameters<typeof handleRealtimeUpdateMachineState>[0] = {
      id: 'u3',
      seq: 7,
      createdAt: 700,
      body: {
        t: 'update-machine',
        machineId: 'machine-1',
        metadata: { version: 4, value: 'encrypted-metadata' },
        daemonState: { version: 5, value: 'encrypted-daemon-state' },
        active: false,
        activeAt: 650,
      },
    };

    await handleRealtimeUpdateMachineState(update, deps);

    expect(deps.ensureMachineEncryption).toHaveBeenCalledWith('machine-1');
    expect(deps.applyMachines).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'machine-1',
        seq: 7,
        createdAt: 10,
        updatedAt: 700,
        active: false,
        activeAt: 650,
        metadataVersion: 4,
        daemonStateVersion: 5,
      }),
    ]);
  });

  it('falls back to activity-only updates when machine encryption is unavailable', async () => {
    vi.mocked(deps.ensureMachineEncryption).mockResolvedValueOnce(null);

    const update: Parameters<typeof handleRealtimeUpdateMachineState>[0] = {
      id: 'u4',
      seq: 8,
      createdAt: 800,
      body: {
        t: 'update-machine',
        machineId: 'machine-1',
        metadata: null,
        daemonState: null,
        active: false,
        activeAt: 780,
      },
    };

    await handleRealtimeUpdateMachineState(update, deps);

    expect(deps.applyMachines).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'machine-1',
        seq: 8,
        updatedAt: 800,
        active: false,
        activeAt: 780,
        metadataVersion: 1,
        daemonStateVersion: 1,
      }),
    ]);
    expect(deps.invalidateMachines).toHaveBeenCalledTimes(1);
  });

  it('applies ephemeral machine activity to an existing machine', () => {
    handleRealtimeMachineActivityUpdate(
      {
        type: 'machine-activity',
        id: 'machine-1',
        active: false,
        activeAt: 900,
      },
      deps,
    );

    expect(deps.applyMachines).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'machine-1',
        active: false,
        activeAt: 900,
      }),
    ]);
  });
});
