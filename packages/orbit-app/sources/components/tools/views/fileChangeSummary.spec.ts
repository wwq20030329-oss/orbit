import { describe, expect, it } from 'vitest';
import { getDefaultFileChangeLabel, summarizeFileChangeItems } from './fileChangeSummary';

describe('summarizeFileChangeItems', () => {
    it('deduplicates paths and limits visible items', () => {
        const result = summarizeFileChangeItems([
            { path: '/tmp/a.ts' },
            { path: '/tmp/b.ts' },
            { path: '/tmp/a.ts' },
        ], 1);

        expect(result.visibleItems).toEqual([{ path: '/tmp/a.ts' }]);
        expect(result.hiddenCount).toBe(1);
    });
});

describe('getDefaultFileChangeLabel', () => {
    it('returns the basename for a file path', () => {
        expect(getDefaultFileChangeLabel('/tmp/src/example.ts')).toBe('example.ts');
    });
});
