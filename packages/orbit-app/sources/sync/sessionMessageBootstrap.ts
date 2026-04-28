export const INITIAL_VISIBLE_MESSAGE_LIMIT = 40;
export const OLDER_MESSAGES_PAGE_LIMIT = 100;

export function shouldBootstrapVisibleSessionMessages(params: {
    loadedCount: number;
    lastSeq: number;
}): boolean {
    return params.loadedCount === 0 && params.lastSeq === 0;
}

export function getMessageSeqBounds(
    messages: Array<{ seq: number }>,
): { oldestSeq: number; newestSeq: number } | null {
    if (messages.length === 0) {
        return null;
    }

    let oldestSeq = messages[0]!.seq;
    let newestSeq = messages[0]!.seq;

    for (const message of messages) {
        if (message.seq < oldestSeq) {
            oldestSeq = message.seq;
        }
        if (message.seq > newestSeq) {
            newestSeq = message.seq;
        }
    }

    return {
        oldestSeq,
        newestSeq,
    };
}
