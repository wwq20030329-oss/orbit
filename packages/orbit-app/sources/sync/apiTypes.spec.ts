import { describe, expect, it } from 'vitest';
import { ApiUpdateContainerSchema } from './apiTypes';

describe('ApiUpdateContainerSchema', () => {
    it('preserves full new-session payloads so the app can hydrate a single session without reloading all sessions', () => {
        const result = ApiUpdateContainerSchema.safeParse({
            id: 'update-2',
            seq: 43,
            createdAt: 1_777_000_100,
            body: {
                t: 'new-session',
                id: 'session-1',
                seq: 9,
                metadata: 'encrypted-metadata',
                metadataVersion: 2,
                agentState: 'encrypted-agent-state',
                agentStateVersion: 3,
                dataEncryptionKey: 'encrypted-key',
                active: true,
                activeAt: 1_777_000_100,
                createdAt: 1_777_000_090,
                updatedAt: 1_777_000_100,
            },
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            return;
        }

        expect(result.data.body).toMatchObject({
            id: 'session-1',
            seq: 9,
            metadata: 'encrypted-metadata',
            metadataVersion: 2,
            agentState: 'encrypted-agent-state',
            agentStateVersion: 3,
            dataEncryptionKey: 'encrypted-key',
            active: true,
            activeAt: 1_777_000_100,
        });
    });

    it('parses new-machine updates with encryption payloads', () => {
        const result = ApiUpdateContainerSchema.safeParse({
            id: 'update-1',
            seq: 42,
            createdAt: 1_777_000_000,
            body: {
                t: 'new-machine',
                machineId: 'machine-1',
                seq: 7,
                metadata: 'encrypted-metadata',
                metadataVersion: 1,
                daemonState: 'encrypted-daemon-state',
                daemonStateVersion: 1,
                dataEncryptionKey: 'encrypted-key',
                active: true,
                activeAt: 1_777_000_000,
                createdAt: 1_777_000_000,
                updatedAt: 1_777_000_001,
            },
        });

        expect(result.success).toBe(true);
    });
});
