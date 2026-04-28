import { afterEach, describe, expect, it } from 'vitest';
import {
    parseMarkdownIncremental,
    __resetMarkdownBlockCacheForTests,
} from './parseMarkdownIncremental';

describe('parseMarkdownIncremental', () => {
    afterEach(() => {
        __resetMarkdownBlockCacheForTests();
    });

    it('returns the same block reference when the block source is unchanged across calls', () => {
        const first = parseMarkdownIncremental('# Stable heading\n\nBody paragraph');
        const second = parseMarkdownIncremental('# Stable heading\n\nBody paragraph');

        expect(first).toHaveLength(2);
        expect(second).toHaveLength(2);
        // Identity is what drives downstream React.memo bail-outs, not value
        // equality, so this is the property that must hold.
        expect(second[0].block).toBe(first[0].block);
        expect(second[1].block).toBe(first[1].block);
    });

    it('reuses cached blocks for the stable prefix while the streaming tail grows', () => {
        const first = parseMarkdownIncremental('# Stable heading\n\nA partial body');
        const second = parseMarkdownIncremental('# Stable heading\n\nA partial body with more text');

        // The heading block is identical across both passes and must be
        // the same object reference — that is the streaming optimization.
        expect(second[0].block).toBe(first[0].block);

        // The tail paragraph's source grew, so it is a fresh object.
        expect(second[1].block).not.toBe(first[1].block);
        if (second[1].block.type !== 'text') {
            throw new Error('Expected trailing text block');
        }
        expect(second[1].source).toBe('A partial body with more text');
    });

    it('preserves source strings across code fences and tables', () => {
        const entries = parseMarkdownIncremental([
            '```ts',
            'const x = 1;',
            '```',
            '',
            '| head |',
            '| --- |',
            '| row  |',
        ].join('\n'));

        expect(entries).toHaveLength(2);
        expect(entries[0].source).toBe('```ts\nconst x = 1;\n```');
        expect(entries[0].block.type).toBe('code-block');
        expect(entries[1].source).toBe('| head |\n| --- |\n| row  |');
        expect(entries[1].block.type).toBe('table');
    });
});
