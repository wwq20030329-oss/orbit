import { describe, expect, it } from 'vitest';
import { MetadataSchema } from './storageTypes';

describe('MetadataSchema', () => {
    it('preserves archive lifecycle metadata', () => {
        const metadata = MetadataSchema.parse({
            path: '/tmp/project',
            host: 'local-machine',
            startedBy: 'daemon',
            startedFromDaemon: true,
            sessionRole: 'native-live-mirror',
            lifecycleState: 'archived',
            lifecycleStateSince: 123,
            archivedBy: 'cli',
            archiveReason: 'User terminated',
        });

        expect(metadata.startedBy).toBe('daemon');
        expect(metadata.startedFromDaemon).toBe(true);
        expect(metadata.sessionRole).toBe('native-live-mirror');
        expect(metadata.lifecycleState).toBe('archived');
        expect(metadata.lifecycleStateSince).toBe(123);
        expect(metadata.archivedBy).toBe('cli');
        expect(metadata.archiveReason).toBe('User terminated');
    });
});
