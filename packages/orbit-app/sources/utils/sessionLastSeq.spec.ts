import { describe, expect, it } from 'vitest';

import {
    getHighestMessageSeq,
    mergeSessionLastSeq,
    resolveTrackedSessionLastSeq,
} from './sessionLastSeq';

describe('sessionLastSeq', () => {
    it('finds the highest available seq in a message batch', () => {
        expect(getHighestMessageSeq([
            { seq: null },
            {},
            { seq: 3 },
            { seq: 7 },
            { seq: 5 },
        ])).toBe(7);
    });

    it('returns null when a batch has no usable seq values', () => {
        expect(getHighestMessageSeq([
            {},
            { seq: null },
        ])).toBeNull();
    });

    it('merges incoming seqs with the current session cursor', () => {
        expect(mergeSessionLastSeq(10, [{ seq: 8 }, { seq: 14 }])).toBe(14);
        expect(mergeSessionLastSeq(10, [{ seq: 8 }, { seq: 9 }])).toBe(10);
        expect(mergeSessionLastSeq(null, [{ seq: 4 }])).toBe(4);
    });

    it('prefers in-memory seqs and falls back to stored cursors', () => {
        expect(resolveTrackedSessionLastSeq(12, 8)).toBe(12);
        expect(resolveTrackedSessionLastSeq(undefined, 8)).toBe(8);
        expect(resolveTrackedSessionLastSeq(undefined, null)).toBeUndefined();
    });
});
