import { describe, expect, it } from 'vitest';
import { mapCodexMcpMessageToSessionEnvelopes } from './sessionProtocolMapper';

describe('mapCodexMcpMessageToSessionEnvelopes', () => {
    it('preserves failed task details as a visible lifecycle message before turn-end', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes({
            type: 'task_complete',
            status: 'failed',
            error: {
                message: 'You have hit your usage limit',
            },
        }, {
            currentTurnId: 'turn-1',
        });

        expect(result.currentTurnId).toBeNull();
        expect(result.envelopes).toHaveLength(2);
        expect(result.envelopes[0]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'service',
                text: 'You have hit your usage limit',
            },
        });
        expect(result.envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-1',
            ev: {
                t: 'turn-end',
                status: 'failed',
            },
        });
    });

    it('does not add a lifecycle message for successful task completion', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes({
            type: 'task_complete',
            status: 'completed',
        }, {
            currentTurnId: 'turn-2',
        });

        expect(result.currentTurnId).toBeNull();
        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0]).toMatchObject({
            role: 'agent',
            turn: 'turn-2',
            ev: {
                t: 'turn-end',
                status: 'completed',
            },
        });
    });

    it('shows abort reasons before the cancelled turn-end marker', () => {
        const result = mapCodexMcpMessageToSessionEnvelopes({
            type: 'turn_aborted',
            reason: 'Permission denied by user',
        }, {
            currentTurnId: 'turn-3',
        });

        expect(result.currentTurnId).toBeNull();
        expect(result.envelopes).toHaveLength(2);
        expect(result.envelopes[0]).toMatchObject({
            role: 'agent',
            turn: 'turn-3',
            ev: {
                t: 'service',
                text: 'Permission denied by user',
            },
        });
        expect(result.envelopes[1]).toMatchObject({
            role: 'agent',
            turn: 'turn-3',
            ev: {
                t: 'turn-end',
                status: 'cancelled',
            },
        });
    });
});
