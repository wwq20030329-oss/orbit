type MessageWithOptionalSeq = {
    seq?: number | null;
};

export function getHighestMessageSeq(messages: MessageWithOptionalSeq[]): number | null {
    let highestSeq: number | null = null;

    for (const message of messages) {
        if (typeof message.seq !== 'number') {
            continue;
        }
        if (highestSeq === null || message.seq > highestSeq) {
            highestSeq = message.seq;
        }
    }

    return highestSeq;
}

export function mergeSessionLastSeq(
    currentLastSeq: number | null | undefined,
    messages: MessageWithOptionalSeq[],
): number | null {
    const incomingLastSeq = getHighestMessageSeq(messages);
    if (incomingLastSeq === null) {
        return currentLastSeq ?? null;
    }
    if (typeof currentLastSeq !== 'number') {
        return incomingLastSeq;
    }
    return incomingLastSeq > currentLastSeq ? incomingLastSeq : currentLastSeq;
}

export function resolveTrackedSessionLastSeq(
    inMemoryLastSeq: number | undefined,
    storedLastSeq: number | null | undefined,
): number | undefined {
    if (typeof inMemoryLastSeq === 'number' && typeof storedLastSeq === 'number') {
        return inMemoryLastSeq > storedLastSeq ? inMemoryLastSeq : storedLastSeq;
    }
    if (typeof inMemoryLastSeq === 'number') {
        return inMemoryLastSeq;
    }
    if (typeof storedLastSeq === 'number') {
        return storedLastSeq;
    }
    return undefined;
}
