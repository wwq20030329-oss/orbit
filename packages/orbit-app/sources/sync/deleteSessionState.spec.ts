import { describe, expect, it } from 'vitest';

import type { Session } from './storageTypes';
import { deleteSessionState } from './deleteSessionState';

function createSession(id: string): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
    };
}

describe('deleteSessionState', () => {
    it('clears the deleted session from phone workspace state and caches', () => {
        const state = {
            sessions: {
                'session-1': createSession('session-1'),
                'session-2': createSession('session-2'),
            },
            cliListSessions: [createSession('session-1'), createSession('session-2')],
            sessionMessages: {
                'session-1': {
                    messages: [],
                    messagesMap: {},
                    reducerState: {},
                    isLoaded: false,
                    lastSeq: null,
                },
            },
            sessionGitStatus: {
                'session-1': null,
            },
            sessionGitStatusFiles: {
                'session-1': null,
            },
            sessionFileCache: {
                'session-1': {},
            },
            pendingPhoneConversationSeeds: {
                'session-1': {
                    optimisticPendingUserMessage: 'hello',
                    optimisticCli: 'codex',
                    createdAt: 1,
                },
                'session-2': {
                    optimisticPendingUserMessage: 'keep me',
                    optimisticCli: 'claude',
                    createdAt: 2,
                },
            },
            phoneWorkspaceSessionId: 'session-1',
        };

        expect(deleteSessionState(state, 'session-1')).toEqual({
            sessions: {
                'session-2': createSession('session-2'),
            },
            cliListSessions: [createSession('session-2')],
            sessionMessages: {},
            sessionGitStatus: {},
            sessionGitStatusFiles: {},
            sessionFileCache: {},
            pendingPhoneConversationSeeds: {
                'session-2': {
                    optimisticPendingUserMessage: 'keep me',
                    optimisticCli: 'claude',
                    createdAt: 2,
                },
            },
            phoneWorkspaceSessionId: null,
        });
    });
});
