import type { Machine } from '@/sync/storageTypes';
import { isMachinePresenceOnline } from './presence';

export function isMachineOnline(machine: Machine): boolean {
    return isMachinePresenceOnline(machine);
}
