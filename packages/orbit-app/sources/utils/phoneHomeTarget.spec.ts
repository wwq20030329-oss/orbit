import { describe, expect, it } from 'vitest';

import { getDefaultPhoneHomeTarget } from '@/utils/phoneHomeTarget';
import type { SessionListViewItem } from '@/sync/storage';
import type { Session, NativeCliHistoryEntry } from '@/sync/storageTypes';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: {
            path: '/Users/wwq/Desktop/claudeapp',
            host: 'wwqdeMac-mini.local',
            summary: {
                text: 'Recent session',
                updatedAt: 2,
            },
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

function createNativeEntry(overrides: Partial<NativeCliHistoryEntry> = {}): NativeCliHistoryEntry {
    return {
        id: 'codex:thread-1',
        tool: 'codex',
        backendId: 'thread-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/wwq/Desktop/hermes-web',
        title: 'Native thread',
        summary: null,
        updatedAt: 10,
        ...overrides,
    };
}

describe('getDefaultPhoneHomeTarget', () => {
    it('returns null for empty data', () => {
        expect(getDefaultPhoneHomeTarget(null)).toBeNull();
        expect(getDefaultPhoneHomeTarget([])).toBeNull();
    });

    it('picks the first session item', () => {
        const data: SessionListViewItem[] = [
            { type: 'session', session: createSession() },
            { type: 'native-cli-session', entry: createNativeEntry() },
        ];

        expect(getDefaultPhoneHomeTarget(data)).toEqual({
            identifier: 'session-1',
            source: 'session',
            title: 'Recent session',
            subtitle: '/Users/wwq/Desktop/claudeapp',
        });
    });

    it('picks the first native session when no orbit session is present', () => {
        const data: SessionListViewItem[] = [
            { type: 'native-cli-session', entry: createNativeEntry() },
        ];

        expect(getDefaultPhoneHomeTarget(data)).toEqual({
            identifier: 'codex:thread-1',
            source: 'native',
            title: 'Native thread',
            subtitle: '/Users/wwq/Desktop/hermes-web',
        });
    });
});
