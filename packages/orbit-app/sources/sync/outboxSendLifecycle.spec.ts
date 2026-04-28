import { describe, expect, it, vi } from 'vitest';

import {
    abortAndDrainPendingOutbox,
    didBackgroundSendTimeoutExpireOnResume,
    getBackgroundSendWatchdogDisposition,
    hasPendingOutboxMessages,
    shouldStartBackgroundSendWatchdog,
} from './outboxSendLifecycle';

type PendingMessage = {
    localId: string;
    content: string;
};

function createPendingOutbox(entries: Record<string, PendingMessage[]>): Map<string, PendingMessage[]> {
    return new Map(Object.entries(entries));
}

describe('outboxSendLifecycle', () => {
    it('detects pending outbox messages from controllers or queued messages', () => {
        const sendAbortControllers = new Map<string, AbortController>();
        const pendingOutbox = createPendingOutbox({
            empty: [],
            queued: [{ localId: 'local-1', content: 'payload' }],
        });

        expect(hasPendingOutboxMessages(sendAbortControllers, pendingOutbox)).toBe(true);

        pendingOutbox.set('queued', []);
        expect(hasPendingOutboxMessages(sendAbortControllers, pendingOutbox)).toBe(false);

        sendAbortControllers.set('session-1', new AbortController());
        expect(hasPendingOutboxMessages(sendAbortControllers, pendingOutbox)).toBe(true);
    });

    it('starts the background send watchdog only when background sends are pending', () => {
        expect(shouldStartBackgroundSendWatchdog({
            appState: 'background',
            hasPendingMessages: true,
            hasWatchdog: false,
        })).toBe(true);

        expect(shouldStartBackgroundSendWatchdog({
            appState: 'active',
            hasPendingMessages: true,
            hasWatchdog: false,
        })).toBe(false);

        expect(shouldStartBackgroundSendWatchdog({
            appState: 'background',
            hasPendingMessages: false,
            hasWatchdog: false,
        })).toBe(false);

        expect(shouldStartBackgroundSendWatchdog({
            appState: 'background',
            hasPendingMessages: true,
            hasWatchdog: true,
        })).toBe(false);
    });

    it('detects when a background send should fail after the app resumes', () => {
        expect(didBackgroundSendTimeoutExpireOnResume({
            backgroundSendStartedAt: 1000,
            hasPendingMessages: true,
            now: 31_001,
            timeoutMs: 30_000,
        })).toBe(true);

        expect(didBackgroundSendTimeoutExpireOnResume({
            backgroundSendStartedAt: 1000,
            hasPendingMessages: false,
            now: 31_001,
            timeoutMs: 30_000,
        })).toBe(false);

        expect(didBackgroundSendTimeoutExpireOnResume({
            backgroundSendStartedAt: null,
            hasPendingMessages: true,
            now: 31_001,
            timeoutMs: 30_000,
        })).toBe(false);
    });

    it('computes the post-flush watchdog disposition from app state and pending sends', () => {
        expect(getBackgroundSendWatchdogDisposition({
            appState: 'active',
            hasPendingMessages: false,
        })).toBe('clear');

        expect(getBackgroundSendWatchdogDisposition({
            appState: 'active',
            hasPendingMessages: true,
        })).toBe('noop');

        expect(getBackgroundSendWatchdogDisposition({
            appState: 'background',
            hasPendingMessages: true,
        })).toBe('start');
    });

    it('aborts controllers and drains queued outbox messages', () => {
        const controllerA = new AbortController();
        const controllerB = new AbortController();
        const abortSpyA = vi.spyOn(controllerA, 'abort');
        const abortSpyB = vi.spyOn(controllerB, 'abort');
        const sendAbortControllers = new Map<string, AbortController>([
            ['session-a', controllerA],
            ['session-b', controllerB],
        ]);
        const pendingOutbox = createPendingOutbox({
            empty: [],
            queuedA: [{ localId: 'local-a', content: 'payload-a' }],
            queuedB: [{ localId: 'local-b', content: 'payload-b' }],
        });

        expect(abortAndDrainPendingOutbox(sendAbortControllers, pendingOutbox)).toEqual(['queuedA', 'queuedB']);
        expect(abortSpyA).toHaveBeenCalledTimes(1);
        expect(abortSpyB).toHaveBeenCalledTimes(1);
        expect(sendAbortControllers.size).toBe(0);
        expect(pendingOutbox.has('queuedA')).toBe(false);
        expect(pendingOutbox.has('queuedB')).toBe(false);
        expect(pendingOutbox.get('empty')).toEqual([]);
    });
});
