import { describe, expect, it } from 'vitest';

import { areNativeCliEntriesEqual } from './nativeCliHistoryEntries';
import type { NativeCliHistoryEntry } from './storageTypes';

function createEntry(overrides: Partial<NativeCliHistoryEntry> = {}): NativeCliHistoryEntry {
    return {
        id: 'entry-1',
        tool: 'claude',
        backendId: 'backend-1',
        machineId: 'machine-1',
        workingDirectory: '/tmp/project',
        projectRoot: '/tmp/project',
        title: 'Title',
        summary: 'Summary',
        updatedAt: 1,
        isLive: false,
        ...overrides,
    };
}

describe('areNativeCliEntriesEqual', () => {
    it('returns true for identical entry arrays', () => {
        const entries = [createEntry(), createEntry({ id: 'entry-2', backendId: 'backend-2' })];
        expect(areNativeCliEntriesEqual(entries, entries.map((entry) => ({ ...entry })))).toBe(true);
    });

    it('returns false when any compared field differs', () => {
        const left = [createEntry()];
        expect(areNativeCliEntriesEqual(left, [createEntry({ updatedAt: 2 })])).toBe(false);
        expect(areNativeCliEntriesEqual(left, [createEntry({ title: 'Other' })])).toBe(false);
        expect(areNativeCliEntriesEqual(left, [createEntry({ projectRoot: '/tmp/other' })])).toBe(false);
    });

    it('returns false when left side is missing or lengths differ', () => {
        expect(areNativeCliEntriesEqual(undefined, [createEntry()])).toBe(false);
        expect(areNativeCliEntriesEqual([createEntry()], [createEntry(), createEntry({ id: 'entry-2' })])).toBe(false);
    });
});
