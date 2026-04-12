import { describe, expect, it } from 'vitest';
import { ApiUpdateContainerSchema } from './apiTypes';

describe('ApiUpdateContainerSchema', () => {
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
