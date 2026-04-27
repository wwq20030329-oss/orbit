type MessageLike = {
    id: string;
    createdAt: number;
};

function findDescendingInsertIndex<T extends MessageLike>(
    messages: readonly T[],
    createdAt: number,
): number {
    let low = 0;
    let high = messages.length;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((messages[mid]?.createdAt ?? 0) < createdAt) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }

    return low;
}

export function mergeMessagesIntoDescendingList<T extends MessageLike>(params: {
    existingMessages: readonly T[];
    existingMessagesMap: Readonly<Record<string, T>>;
    incomingMessages: readonly T[];
}): {
    messages: T[];
    messagesMap: Record<string, T>;
    changed: boolean;
} {
    const { existingMessages, existingMessagesMap, incomingMessages } = params;

    if (incomingMessages.length === 0) {
        return {
            messages: existingMessages as T[],
            messagesMap: existingMessagesMap as Record<string, T>,
            changed: false,
        };
    }

    let changed = false;
    let nextMessages = existingMessages as T[];
    let nextMessagesMap = existingMessagesMap as Record<string, T>;

    const ensureMutableMessages = (): T[] => {
        if (nextMessages === existingMessages) {
            nextMessages = [...existingMessages];
        }
        return nextMessages;
    };

    const ensureMutableMessagesMap = (): Record<string, T> => {
        if (nextMessagesMap === existingMessagesMap) {
            nextMessagesMap = { ...existingMessagesMap };
        }
        return nextMessagesMap;
    };

    for (const incomingMessage of incomingMessages) {
        const previousMessage = nextMessagesMap[incomingMessage.id];
        if (previousMessage === incomingMessage) {
            continue;
        }

        ensureMutableMessagesMap()[incomingMessage.id] = incomingMessage;

        const previousIndex = nextMessages.findIndex((message) => message.id === incomingMessage.id);
        if (previousIndex === -1) {
            const mutableMessages = ensureMutableMessages();
            mutableMessages.splice(
                findDescendingInsertIndex(mutableMessages, incomingMessage.createdAt),
                0,
                incomingMessage,
            );
            changed = true;
            continue;
        }

        const mutableMessages = ensureMutableMessages();
        if ((previousMessage?.createdAt ?? mutableMessages[previousIndex]?.createdAt) === incomingMessage.createdAt) {
            if (mutableMessages[previousIndex] !== incomingMessage) {
                mutableMessages[previousIndex] = incomingMessage;
                changed = true;
            }
            continue;
        }

        mutableMessages.splice(previousIndex, 1);
        mutableMessages.splice(
            findDescendingInsertIndex(mutableMessages, incomingMessage.createdAt),
            0,
            incomingMessage,
        );
        changed = true;
    }

    return {
        messages: nextMessages,
        messagesMap: nextMessagesMap,
        changed,
    };
}
