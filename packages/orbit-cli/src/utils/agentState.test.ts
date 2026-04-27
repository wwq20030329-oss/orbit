import { describe, expect, it } from 'vitest';
import { withControlledByUser, withLocalControl, withRemoteControl } from './agentState';

describe('agentState control helpers', () => {
    it('creates remote-controlled state from null', () => {
        expect(withRemoteControl(null)).toEqual({
            controlledByUser: false,
        });
    });

    it('creates local-controlled state from undefined', () => {
        expect(withLocalControl(undefined)).toEqual({
            controlledByUser: true,
        });
    });

    it('preserves existing request state while updating control mode', () => {
        const state = {
            controlledByUser: true,
            requests: {
                request1: {
                    tool: 'Bash',
                    arguments: { command: 'pwd' },
                    createdAt: 1,
                },
            },
            completedRequests: {
                request0: {
                    tool: 'Read',
                    arguments: { path: '/tmp/a.txt' },
                    createdAt: 0,
                    completedAt: 1,
                    status: 'approved' as const,
                    reason: undefined,
                    mode: undefined,
                    allowTools: undefined,
                    decision: 'approved' as const,
                },
            },
        };

        expect(withControlledByUser(state, false)).toEqual({
            ...state,
            controlledByUser: false,
        });
    });
});
