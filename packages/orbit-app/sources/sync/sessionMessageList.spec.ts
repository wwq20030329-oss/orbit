import { describe, expect, it } from 'vitest';

import { mergeMessagesIntoDescendingList } from './sessionMessageList';

type TestMessage = {
    id: string;
    createdAt: number;
    text: string;
};

function message(id: string, createdAt: number, text = id): TestMessage {
    return { id, createdAt, text };
}

describe('mergeMessagesIntoDescendingList', () => {
    it('inserts new messages without re-sorting the whole list', () => {
        const existingMessages = [
            message('m3', 30),
            message('m2', 20),
            message('m1', 10),
        ];
        const existingMessagesMap = {
            m3: existingMessages[0],
            m2: existingMessages[1],
            m1: existingMessages[2],
        };

        const result = mergeMessagesIntoDescendingList({
            existingMessages,
            existingMessagesMap,
            incomingMessages: [message('m4', 40), message('m25', 25)],
        });

        expect(result.messages.map((item) => item.id)).toEqual(['m4', 'm3', 'm25', 'm2', 'm1']);
        expect(result.messagesMap.m4?.text).toBe('m4');
        expect(result.changed).toBe(true);
    });

    it('replaces existing messages in place when ordering does not change', () => {
        const existingMessages = [
            message('m3', 30, 'old'),
            message('m2', 20),
        ];
        const existingMessagesMap = {
            m3: existingMessages[0],
            m2: existingMessages[1],
        };
        const updated = message('m3', 30, 'new');

        const result = mergeMessagesIntoDescendingList({
            existingMessages,
            existingMessagesMap,
            incomingMessages: [updated],
        });

        expect(result.messages.map((item) => item.id)).toEqual(['m3', 'm2']);
        expect(result.messages[0]).toBe(updated);
        expect(result.messages[1]).toBe(existingMessages[1]);
        expect(result.changed).toBe(true);
    });

    it('moves updated messages when createdAt changes', () => {
        const existingMessages = [
            message('m3', 30),
            message('m2', 20),
            message('m1', 10),
        ];
        const existingMessagesMap = {
            m3: existingMessages[0],
            m2: existingMessages[1],
            m1: existingMessages[2],
        };
        const updated = message('m1', 35);

        const result = mergeMessagesIntoDescendingList({
            existingMessages,
            existingMessagesMap,
            incomingMessages: [updated],
        });

        expect(result.messages.map((item) => item.id)).toEqual(['m1', 'm3', 'm2']);
        expect(result.messages[0]).toBe(updated);
        expect(result.changed).toBe(true);
    });

    it('preserves references when nothing materially changes', () => {
        const existingMessages = [
            message('m2', 20),
            message('m1', 10),
        ];
        const existingMessagesMap = {
            m2: existingMessages[0],
            m1: existingMessages[1],
        };

        const result = mergeMessagesIntoDescendingList({
            existingMessages,
            existingMessagesMap,
            incomingMessages: [existingMessages[0]],
        });

        expect(result.messages).toBe(existingMessages);
        expect(result.messagesMap).toBe(existingMessagesMap);
        expect(result.changed).toBe(false);
    });
});
