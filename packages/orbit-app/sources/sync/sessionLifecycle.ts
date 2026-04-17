type RawLifecycleContent = {
    content?: {
        type?: string;
        data?: {
            type?: string;
            ev?: { t?: string };
        };
    };
} | null;

export type SessionLifecycleState = {
    isTaskComplete: boolean;
    isTaskStarted: boolean;
};

export function getSessionLifecycleState(content: unknown): SessionLifecycleState {
    const rawContent = content as RawLifecycleContent;
    const contentType = rawContent?.content?.type;
    const dataType = rawContent?.content?.data?.type;
    const sessionEventType = rawContent?.content?.data?.ev?.t;

    const isTaskComplete =
        ((contentType === 'acp' || contentType === 'codex') &&
            (dataType === 'task_complete' || dataType === 'turn_aborted')) ||
        (contentType === 'session' && sessionEventType === 'turn-end');

    const isTaskStarted =
        ((contentType === 'acp' || contentType === 'codex') && dataType === 'task_started') ||
        (contentType === 'session' && sessionEventType === 'turn-start');

    return {
        isTaskComplete,
        isTaskStarted
    };
}
