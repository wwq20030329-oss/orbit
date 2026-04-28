import { describe, expect, it } from 'vitest';

import { parseMessageAsEvent } from './messageToEvent';
import type { NormalizedMessage } from '../typesRaw';

function agentTextMessage(text: string, createdAt: number): NormalizedMessage {
    return {
        id: 'message-1',
        localId: null,
        role: 'agent',
        content: [{
            type: 'text',
            text,
            uuid: 'content-1',
            parentUUID: null,
        }],
        createdAt,
        isSidechain: false,
    };
}

describe('parseMessageAsEvent', () => {
    it('converts Codex usage limit text into a limit event', () => {
        const event = parseMessageAsEvent(agentTextMessage(
            "You've hit your usage limit. To get more access now, send a request to your admin or try again at 1:35 PM.",
            new Date('2026-04-27T09:02:00').getTime(),
        ));

        expect(event).toEqual({
            type: 'limit-reached',
            endsAt: Math.floor(new Date('2026-04-27T13:35:00').getTime() / 1000),
        });
    });

    it('keeps usage limit retry times on the next day when needed', () => {
        const event = parseMessageAsEvent(agentTextMessage(
            "You've hit your usage limit. Upgrade to Pro or try again at 9:41 AM.",
            new Date('2026-04-27T23:10:00').getTime(),
        ));

        expect(event).toEqual({
            type: 'limit-reached',
            endsAt: Math.floor(new Date('2026-04-28T09:41:00').getTime() / 1000),
        });
    });
});
