import { describe, expect, it } from 'vitest';

import { VisibleSessionTracker } from './visibleSessionTracker';

describe('VisibleSessionTracker', () => {
    it('marks sessions visible only on first mount', () => {
        const tracker = new VisibleSessionTracker();

        expect(tracker.markVisible('session-1')).toBe(true);
        expect(tracker.markVisible('session-1')).toBe(false);
        expect(tracker.isVisible('session-1')).toBe(true);
    });

    it('bumps the visibility version only when visibility actually flips', () => {
        const tracker = new VisibleSessionTracker();

        expect(tracker.getVersion('session-1')).toBe(0);

        tracker.markVisible('session-1');
        expect(tracker.getVersion('session-1')).toBe(1);

        tracker.markVisible('session-1');
        expect(tracker.getVersion('session-1')).toBe(1);

        tracker.markHidden('session-1');
        expect(tracker.getVersion('session-1')).toBe(1);

        tracker.markHidden('session-1');
        expect(tracker.getVersion('session-1')).toBe(2);

        tracker.markVisible('session-1');
        expect(tracker.getVersion('session-1')).toBe(3);
    });

    it('keeps sessions visible until all mounts are hidden', () => {
        const tracker = new VisibleSessionTracker();

        tracker.markVisible('session-1');
        tracker.markVisible('session-1');

        expect(tracker.markHidden('session-1')).toBe(true);
        expect(tracker.isVisible('session-1')).toBe(true);

        expect(tracker.markHidden('session-1')).toBe(true);
        expect(tracker.isVisible('session-1')).toBe(false);
    });

    it('lists only active visible sessions', () => {
        const tracker = new VisibleSessionTracker();

        tracker.markVisible('session-1');
        tracker.markVisible('session-2');
        tracker.markHidden('session-1');

        expect(tracker.listVisible()).toEqual(['session-2']);
    });
});
