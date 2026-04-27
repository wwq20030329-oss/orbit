import { describe, expect, it } from 'vitest';

import { shouldAutoResumeSession } from './sessionAutoResume';

describe('shouldAutoResumeSession', () => {
    it('returns true when a disconnected resumable session should auto-attach', () => {
        expect(shouldAutoResumeSession({
            isDisconnected: true,
            canShowResume: true,
            canResume: true,
            resumingSession: false,
            nativeConnectionPending: false,
            isInactiveArchivedSession: false,
        })).toBe(true);
    });

    it('returns false when native connection is already pending', () => {
        expect(shouldAutoResumeSession({
            isDisconnected: true,
            canShowResume: true,
            canResume: true,
            resumingSession: false,
            nativeConnectionPending: true,
            isInactiveArchivedSession: false,
        })).toBe(false);
    });

    it('returns false for inactive archived sessions', () => {
        expect(shouldAutoResumeSession({
            isDisconnected: true,
            canShowResume: true,
            canResume: true,
            resumingSession: false,
            nativeConnectionPending: false,
            isInactiveArchivedSession: true,
        })).toBe(false);
    });
});
