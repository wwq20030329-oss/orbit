import type { Machine } from '@/sync/storageTypes';
import { isMachinePresenceOnline } from './presence';

export type SocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function resolveDisplayConnectionStatus(
    socketStatus: SocketConnectionStatus,
    machines: Machine[],
    now: number = Date.now(),
): SocketConnectionStatus {
    const hasOnlineMachine = machines.some((machine) => isMachinePresenceOnline(machine, now));

    if (hasOnlineMachine) {
        return 'connected';
    }

    return socketStatus;
}
