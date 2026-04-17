import { apiSocket } from '@/sync/apiSocket';
import type { ApiMessage } from '@/sync/apiTypes';
import { getMessageSeqBounds } from '@/sync/sessionMessageBootstrap';
import type { RawRecord } from '@/sync/typesRaw';
import { normalizeRawMessage, type NormalizedMessage } from '@/sync/typesRaw';

type V3GetSessionMessagesResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
};

type DecryptedSessionMessage = {
    id: string;
    localId: string | null;
    createdAt: number;
    content: RawRecord;
};

export type SessionMessagesPage = {
    normalizedMessages: NormalizedMessage[];
    hasMore: boolean;
    oldestSeq: number | null;
    newestSeq: number | null;
};

export type SessionMessagesPageOptions = {
    signal?: AbortSignal;
    afterSeq?: number;
    beforeSeq?: number;
    tail?: boolean;
    limit: number;
};

export function buildSessionMessagesPath(
    sessionId: string,
    options: SessionMessagesPageOptions,
): string {
    const query = new URLSearchParams();
    query.set('limit', String(options.limit));
    if (typeof options.afterSeq === 'number') {
        query.set('after_seq', String(options.afterSeq));
    }
    if (typeof options.beforeSeq === 'number') {
        query.set('before_seq', String(options.beforeSeq));
    }
    if (options.tail) {
        query.set('tail', 'true');
    }
    return `/v3/sessions/${sessionId}/messages?${query.toString()}`;
}

export async function fetchSessionMessagesPage(
    sessionId: string,
    decryptMessages: (messages: ApiMessage[]) => Promise<Array<DecryptedSessionMessage | null>>,
    options: SessionMessagesPageOptions,
): Promise<SessionMessagesPage> {
    const response = await apiSocket.request(
        buildSessionMessagesPath(sessionId, options),
        options.signal ? { signal: options.signal } : undefined,
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch messages for ${sessionId}: ${response.status}`);
    }

    const data = await response.json() as V3GetSessionMessagesResponse;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const decryptedMessages = await decryptMessages(messages);
    const normalizedMessages: NormalizedMessage[] = [];

    for (let i = 0; i < decryptedMessages.length; i += 1) {
        const decrypted = decryptedMessages[i];
        if (!decrypted) {
            continue;
        }
        const normalized = normalizeRawMessage(
            decrypted.id,
            decrypted.localId,
            decrypted.createdAt,
            decrypted.content,
        );
        if (normalized) {
            normalizedMessages.push(normalized);
        }
    }

    const bounds = getMessageSeqBounds(messages);
    return {
        normalizedMessages,
        hasMore: !!data.hasMore,
        oldestSeq: bounds?.oldestSeq ?? null,
        newestSeq: bounds?.newestSeq ?? null,
    };
}
