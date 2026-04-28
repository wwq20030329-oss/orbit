type RealtimeMode = 'idle' | 'agent-speaking' | 'user-speaking';

const REALTIME_MODE_DEBOUNCE_MS = 150;

let realtimeModeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleRealtimeModeUpdate(args: {
    mode: RealtimeMode;
    immediate?: boolean;
    applyMode: (mode: RealtimeMode) => void;
}): void {
    const { mode, immediate, applyMode } = args;

    if (immediate) {
        clearRealtimeModeDebounce();
        applyMode(mode);
        return;
    }

    if (realtimeModeDebounceTimer) {
        clearTimeout(realtimeModeDebounceTimer);
    }

    realtimeModeDebounceTimer = setTimeout(() => {
        realtimeModeDebounceTimer = null;
        applyMode(mode);
    }, REALTIME_MODE_DEBOUNCE_MS);
}

export function clearRealtimeModeDebounce(): void {
    if (realtimeModeDebounceTimer) {
        clearTimeout(realtimeModeDebounceTimer);
        realtimeModeDebounceTimer = null;
    }
}
