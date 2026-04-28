import { describe, expect, it } from 'vitest';
import { LIVE_MACHINE_GRACE_MS } from './presence';
import { resolveDisplayConnectionStatus } from './connectionStatus';
import type { Machine } from '@/sync/storageTypes';

function createMachine(overrides: Partial<Machine> = {}): Machine {
    const now = Date.now();

    return {
        id: 'machine-1',
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active: false,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        ...overrides,
    };
}

describe('resolveDisplayConnectionStatus', () => {
    it('shows connected when a machine is recently online even if the socket says disconnected', () => {
        const now = Date.now();
        const machine = createMachine({
            active: true,
            activeAt: now - 5_000,
        });

        expect(resolveDisplayConnectionStatus('disconnected', [machine], now)).toBe('connected');
    });

    it('keeps disconnected when there is no online machine', () => {
        expect(resolveDisplayConnectionStatus('disconnected', [], Date.now())).toBe('disconnected');
    });

    it('keeps connecting while waiting for a machine to come online', () => {
        expect(resolveDisplayConnectionStatus('connecting', [], Date.now())).toBe('connecting');
    });

    it('ignores stale machine presence beyond the grace window', () => {
        const now = Date.now();
        const machine = createMachine({
            active: true,
            activeAt: now - LIVE_MACHINE_GRACE_MS - 1_000,
        });

        expect(resolveDisplayConnectionStatus('error', [machine], now)).toBe('error');
    });
});
