import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
    request: vi.fn(),
}));

vi.mock('@/sync/apiSocket', () => ({
    apiSocket: {
        request: hoisted.request,
    },
}));

import { buildSessionMessagesPath, fetchSessionMessagesPage } from './sessionMessagesApi';

describe('buildSessionMessagesPath', () => {
    it('builds a tail query with limit', () => {
        expect(buildSessionMessagesPath('session-1', {
            tail: true,
            limit: 40,
        })).toBe('/v3/sessions/session-1/messages?limit=40&tail=true');
    });

    it('builds paging query params', () => {
        expect(buildSessionMessagesPath('session-2', {
            afterSeq: 10,
            beforeSeq: 20,
            limit: 100,
        })).toBe('/v3/sessions/session-2/messages?limit=100&after_seq=10&before_seq=20');
    });
});

describe('fetchSessionMessagesPage', () => {
    beforeEach(() => {
        hoisted.request.mockReset();
    });

    it('normalizes decrypted messages and returns seq bounds', async () => {
        hoisted.request.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hasMore: true,
                messages: [
                    {
                        id: 'msg-1',
                        localId: null,
                        seq: 4,
                        createdAt: 100,
                        updatedAt: 100,
                        content: 'encrypted-1',
                    },
                    {
                        id: 'msg-2',
                        localId: null,
                        seq: 7,
                        createdAt: 200,
                        updatedAt: 200,
                        content: 'encrypted-2',
                    },
                ],
            }),
        });

        const result = await fetchSessionMessagesPage(
            'session-3',
            async () => ([
                {
                    id: 'msg-1',
                    localId: null,
                    createdAt: 100,
                    content: { role: 'user', content: { type: 'text', text: 'hello' } },
                },
                {
                    id: 'msg-2',
                    localId: null,
                    createdAt: 200,
                    content: { role: 'user', content: { type: 'text', text: 'world' } },
                },
            ]),
            { limit: 2, tail: true },
        );

        expect(hoisted.request).toHaveBeenCalledWith(
            '/v3/sessions/session-3/messages?limit=2&tail=true',
            undefined,
        );
        expect(result.normalizedMessages).toHaveLength(2);
        expect(result.oldestSeq).toBe(4);
        expect(result.newestSeq).toBe(7);
        expect(result.hasMore).toBe(true);
    });

    it('throws on non-ok responses', async () => {
        hoisted.request.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        await expect(fetchSessionMessagesPage(
            'session-4',
            async () => [],
            { limit: 10 },
        )).rejects.toThrow('Failed to fetch messages for session-4: 500');
    });
});
