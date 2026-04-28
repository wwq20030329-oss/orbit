export type SessionRefreshReason =
    | 'app-active'
    | 'socket-reconnected'
    | 'realtime-message-gap'
    | 'session-control-returned';

type SessionRefreshHandler = (reason: SessionRefreshReason) => void;

const handlersBySessionId = new Map<string, Set<SessionRefreshHandler>>();

export function registerSessionRefreshHandler(
    sessionId: string,
    handler: SessionRefreshHandler,
): () => void {
    let handlers = handlersBySessionId.get(sessionId);
    if (!handlers) {
        handlers = new Set();
        handlersBySessionId.set(sessionId, handlers);
    }

    handlers.add(handler);

    return () => {
        const currentHandlers = handlersBySessionId.get(sessionId);
        if (!currentHandlers) {
            return;
        }

        currentHandlers.delete(handler);
        if (currentHandlers.size === 0) {
            handlersBySessionId.delete(sessionId);
        }
    };
}

export function requestSessionRefresh(
    sessionId: string,
    reason: SessionRefreshReason,
): boolean {
    const handlers = handlersBySessionId.get(sessionId);
    if (!handlers || handlers.size === 0) {
        return false;
    }

    handlers.forEach((handler) => {
        handler(reason);
    });
    return true;
}
