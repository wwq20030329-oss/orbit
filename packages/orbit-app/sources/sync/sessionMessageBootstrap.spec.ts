import { describe, expect, it } from 'vitest';

import {
    getMessageSeqBounds,
    INITIAL_VISIBLE_MESSAGE_LIMIT,
    OLDER_MESSAGES_PAGE_LIMIT,
    shouldBootstrapVisibleSessionMessages,
} from './sessionMessageBootstrap';

describe('sessionMessageBootstrap', () => {
    it('bootstraps with recent messages only when no messages are cached yet', () => {
        expect(shouldBootstrapVisibleSessionMessages({ loadedCount: 0, lastSeq: 0 })).toBe(true);
        expect(shouldBootstrapVisibleSessionMessages({ loadedCount: 5, lastSeq: 0 })).toBe(false);
        expect(shouldBootstrapVisibleSessionMessages({ loadedCount: 0, lastSeq: 12 })).toBe(false);
    });

    it('returns the oldest and newest seq bounds for a page of messages', () => {
        expect(getMessageSeqBounds([])).toBeNull();
        expect(getMessageSeqBounds([{ seq: 7 }, { seq: 9 }, { seq: 8 }])).toEqual({
            oldestSeq: 7,
            newestSeq: 9,
        });
    });

    it('uses compact initial and larger backfill page sizes', () => {
        expect(INITIAL_VISIBLE_MESSAGE_LIMIT).toBe(40);
        expect(OLDER_MESSAGES_PAGE_LIMIT).toBe(100);
    });
});
