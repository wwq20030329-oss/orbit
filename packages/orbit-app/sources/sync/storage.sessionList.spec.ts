import { describe, expect, it } from 'vitest';

import type { Session } from './storageTypes';
import { isCliSessionRelevantForList } from './sessionListFilters';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 0,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

describe('isCliSessionRelevantForList', () => {
    it('hides native live mirror sessions from the user-facing list', () => {
        const session = createSession({
            metadata: {
                path: '/Users/test/project',
                host: 'test-mac',
                machineId: 'machine-1',
                codexThreadId: 'thread-1',
                flavor: 'codex',
                sessionRole: 'native-live-mirror',
            },
        });

        expect(isCliSessionRelevantForList(session)).toBe(false);
    });

    it('includes imported native history sessions even when direct backend ids are missing', () => {
        const session = createSession({
            metadata: {
                path: '/Users/test/project',
                host: 'test-mac',
                machineId: 'machine-1',
                flavor: 'codex',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-1',
                nativeHistoryImportedAt: 123,
            },
        });

        expect(isCliSessionRelevantForList(session)).toBe(true);
    });

    it('hides flavor-only shell sessions that have no recoverable native identifier', () => {
        const session = createSession({
            metadata: {
                path: '/Users/test/project',
                host: 'test-mac',
                machineId: 'machine-1',
                flavor: 'codex',
            },
        });

        expect(isCliSessionRelevantForList(session)).toBe(false);
    });

    it('still ignores sessions without CLI metadata', () => {
        expect(isCliSessionRelevantForList(createSession())).toBe(false);
    });
});
