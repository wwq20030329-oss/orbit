function getObjectValue(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return (value as Record<string, unknown>)[key];
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function normalizeNotificationData(data: unknown): unknown {
    if (typeof data === 'string') {
        return parseJson(data);
    }
    return data;
}

function getSessionIdentifierFromUrl(url: string): string | null {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        return null;
    }

    const match = trimmedUrl.match(/(?:^|\/)session\/([^/?#]+)/);
    if (!match) {
        return null;
    }

    const encodedSessionId = match[1];
    const sessionId = (() => {
        try {
            return decodeURIComponent(encodedSessionId);
        } catch {
            return encodedSessionId;
        }
    })();

    const trimmedSessionId = sessionId.trim();
    return trimmedSessionId || null;
}

export function getSessionIdentifierFromNotificationData(data: unknown): string | null {
    const normalizedData = normalizeNotificationData(data);
    if (!normalizedData || typeof normalizedData !== 'object' || Array.isArray(normalizedData)) {
        return null;
    }

    const url = getObjectValue(normalizedData, 'url');
    if (typeof url === 'string') {
        const identifierFromUrl = getSessionIdentifierFromUrl(url);
        if (identifierFromUrl) {
            return identifierFromUrl;
        }
    }

    const sessionId = getObjectValue(normalizedData, 'sessionId');
    if (typeof sessionId !== 'string') {
        return null;
    }

    const trimmedSessionId = sessionId.trim();
    return trimmedSessionId || null;
}

export function getSessionIdentifierFromNotificationResponse(response: unknown): string | null {
    const contentData = getObjectValue(getObjectValue(getObjectValue(response, 'notification'), 'request'), 'content');
    return getSessionIdentifierFromNotificationData(getObjectValue(contentData, 'data'));
}
