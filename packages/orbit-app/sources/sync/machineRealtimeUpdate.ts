import {
  ApiEphemeralMachineActivityUpdateSchema,
  ApiNewMachineSchema,
  ApiUpdateMachineStateSchema,
  type ApiUpdateContainer,
} from './apiTypes';
import type { Machine } from './storageTypes';

type NewMachineUpdate = ApiUpdateContainer & {
  body: import('zod').infer<typeof ApiNewMachineSchema>;
};

type UpdateMachineStateUpdate = ApiUpdateContainer & {
  body: import('zod').infer<typeof ApiUpdateMachineStateSchema>;
};

type MachineActivityUpdate = import('zod').infer<typeof ApiEphemeralMachineActivityUpdateSchema>;

type MachineEncryptionLike = {
  decryptMetadata: (version: number, value: string) => Promise<Machine['metadata']>;
  decryptDaemonState: (version: number, value: string) => Promise<Machine['daemonState']>;
};

export type MachineRealtimeUpdateDependencies = {
  ensureMachineEncryption: (
    machineId: string,
    dataEncryptionKey?: string | null,
  ) => Promise<MachineEncryptionLike | null | undefined>;
  getMachine: (machineId: string) => Machine | undefined;
  applyMachines: (machines: Machine[]) => void;
  invalidateMachines: () => void;
};

export async function handleRealtimeNewMachineUpdate(
  update: NewMachineUpdate,
  deps: MachineRealtimeUpdateDependencies,
): Promise<void> {
  const machineUpdate = update.body;
  const machineId = machineUpdate.machineId;
  const machineEncryption = await deps.ensureMachineEncryption(machineId, machineUpdate.dataEncryptionKey);

  if (!machineEncryption) {
    deps.invalidateMachines();
    return;
  }

  try {
    const metadata = machineUpdate.metadata
      ? await machineEncryption.decryptMetadata(machineUpdate.metadataVersion, machineUpdate.metadata)
      : null;

    if (machineUpdate.metadata && !metadata) {
      return;
    }

    const daemonState = machineUpdate.daemonState
      ? await machineEncryption.decryptDaemonState(machineUpdate.daemonStateVersion, machineUpdate.daemonState)
      : null;

    deps.applyMachines([{
      id: machineId,
      seq: machineUpdate.seq,
      createdAt: machineUpdate.createdAt,
      updatedAt: machineUpdate.updatedAt,
      active: machineUpdate.active,
      activeAt: machineUpdate.activeAt,
      metadata,
      metadataVersion: machineUpdate.metadataVersion,
      daemonState,
      daemonStateVersion: machineUpdate.daemonStateVersion,
    }]);
  } catch (error) {
    console.warn(`Failed to process new machine ${machineId}:`, error);
    deps.invalidateMachines();
  }
}

export async function handleRealtimeUpdateMachineState(
  update: UpdateMachineStateUpdate,
  deps: MachineRealtimeUpdateDependencies,
): Promise<void> {
  const machineUpdate = update.body;
  const machineId = machineUpdate.machineId;
  const machine = deps.getMachine(machineId);

  const updatedMachine: Machine = {
    id: machineId,
    seq: update.seq,
    createdAt: machine?.createdAt ?? update.createdAt,
    updatedAt: update.createdAt,
    active: machineUpdate.active ?? true,
    activeAt: machineUpdate.activeAt ?? update.createdAt,
    metadata: machine?.metadata ?? null,
    metadataVersion: machine?.metadataVersion ?? 0,
    daemonState: machine?.daemonState ?? null,
    daemonStateVersion: machine?.daemonStateVersion ?? 0,
  };

  const machineEncryption = await deps.ensureMachineEncryption(machineId);
  if (!machineEncryption) {
    deps.applyMachines([updatedMachine]);
    deps.invalidateMachines();
    return;
  }

  const metadataUpdate = machineUpdate.metadata;
  if (metadataUpdate) {
    try {
      const metadata = await machineEncryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
      if (!metadata) {
        return;
      }
      updatedMachine.metadata = metadata;
      updatedMachine.metadataVersion = metadataUpdate.version;
    } catch (error) {
      console.error(`Failed to decrypt machine metadata for ${machineId}:`, error);
    }
  }

  const daemonStateUpdate = machineUpdate.daemonState;
  if (daemonStateUpdate) {
    try {
      const daemonState = await machineEncryption.decryptDaemonState(daemonStateUpdate.version, daemonStateUpdate.value);
      updatedMachine.daemonState = daemonState;
      updatedMachine.daemonStateVersion = daemonStateUpdate.version;
    } catch (error) {
      console.error(`Failed to decrypt machine daemonState for ${machineId}:`, error);
    }
  }

  deps.applyMachines([updatedMachine]);
}

export function handleRealtimeMachineActivityUpdate(
  update: MachineActivityUpdate,
  deps: Pick<MachineRealtimeUpdateDependencies, 'getMachine' | 'applyMachines'>,
): void {
  const machine = deps.getMachine(update.id);
  if (!machine) {
    return;
  }

  deps.applyMachines([{
    ...machine,
    active: update.active,
    activeAt: update.activeAt,
  }]);
}
