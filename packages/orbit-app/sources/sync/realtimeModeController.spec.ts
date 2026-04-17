import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRealtimeModeDebounce, scheduleRealtimeModeUpdate } from './realtimeModeController';

describe('realtimeModeController', () => {
    beforeEach(() => {
        clearRealtimeModeDebounce();
        vi.useFakeTimers();
    });

    it('applies mode immediately when requested', () => {
        const applyMode = vi.fn();

        scheduleRealtimeModeUpdate({
            mode: 'agent-speaking',
            immediate: true,
            applyMode,
        });

        expect(applyMode).toHaveBeenCalledWith('agent-speaking');
    });

    it('debounces mode updates and only applies the latest mode', () => {
        const applyMode = vi.fn();

        scheduleRealtimeModeUpdate({
            mode: 'agent-speaking',
            applyMode,
        });
        scheduleRealtimeModeUpdate({
            mode: 'user-speaking',
            applyMode,
        });

        vi.advanceTimersByTime(149);
        expect(applyMode).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(applyMode).toHaveBeenCalledTimes(1);
        expect(applyMode).toHaveBeenCalledWith('user-speaking');
    });

    it('cancels pending debounce work when cleared', () => {
        const applyMode = vi.fn();

        scheduleRealtimeModeUpdate({
            mode: 'idle',
            applyMode,
        });
        clearRealtimeModeDebounce();

        vi.runAllTimers();
        expect(applyMode).not.toHaveBeenCalled();
    });
});
