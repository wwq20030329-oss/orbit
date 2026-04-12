import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './parseMarkdown';

function spansToText(spans: { text: string }[]) {
    return spans.map((span) => span.text).join('');
}

function tableToText(table: Extract<ReturnType<typeof parseMarkdown>[number], { type: 'table' }>) {
    return {
        type: table.type,
        headers: table.headers.map((cell) => spansToText(cell)),
        rows: table.rows.map((row) => row.map((cell) => spansToText(cell))),
    };
}

describe('parseMarkdownBlock - table parsing', () => {

    it('parses a standard table without blank lines', () => {
        const md = [
            '| A | B |',
            '|---|---|',
            '| 1 | 2 |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        expect(blocks).toHaveLength(1);
        if (blocks[0].type !== 'table') throw new Error('not a table');
        expect(tableToText(blocks[0])).toEqual({
            type: 'table',
            headers: ['A', 'B'],
            rows: [['1', '2']],
        });
    });

    it('parses a table with blank lines between rows (LLM output)', () => {
        const md = [
            '| A | B |',
            '',
            '|---|---|',
            '',
            '| 1 | 2 |',
            '',
            '| 3 | 4 |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        // Should be recognized as a single table, not 4 separate text blocks
        const tableBlocks = blocks.filter(b => b.type === 'table');
        expect(tableBlocks).toHaveLength(1);
        expect(tableToText(tableBlocks[0])).toEqual({
            type: 'table',
            headers: ['A', 'B'],
            rows: [['1', '2'], ['3', '4']],
        });
    });

    it('preserves empty interior cells (e.g. row header column)', () => {
        const md = [
            '| | Header1 | Header2 |',
            '|---|---|---|',
            '| Row1 | a | b |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        expect(blocks).toHaveLength(1);
        if (blocks[0].type !== 'table') throw new Error('not a table');
        expect(tableToText(blocks[0])).toEqual({
            type: 'table',
            headers: ['', 'Header1', 'Header2'],
            rows: [['Row1', 'a', 'b']],
        });
    });

    it('handles blank lines and empty first cell combined', () => {
        const md = [
            '### Comparison',
            '',
            '| | Plan A | Plan B |',
            '',
            '|--|----|----|',
            '',
            '| Price | $10/mo | $20/mo |',
            '',
            '| Storage | 5 GB | 50 GB |',
            '',
            '| Support | Email only | 24/7 chat |',
        ].join('\n');

        const blocks = parseMarkdown(md);
        const tableBlocks = blocks.filter(b => b.type === 'table');
        expect(tableBlocks).toHaveLength(1);

        const table = tableBlocks[0];
        if (table.type !== 'table') throw new Error('not a table');

        // Empty first cell should be preserved
        expect(table.headers).toHaveLength(3);
        expect(spansToText(table.headers[0])).toBe('');

        expect(table.rows).toHaveLength(3);
        expect(spansToText(table.rows[0][0])).toBe('Price');
    });

    it('stops table collection at non-blank, non-pipe lines', () => {
        const md = [
            '| A | B |',
            '|---|---|',
            '| 1 | 2 |',
            '',
            'Some text after the table',
        ].join('\n');

        const blocks = parseMarkdown(md);
        const tableBlocks = blocks.filter(b => b.type === 'table');
        const textBlocks = blocks.filter(b => b.type === 'text');

        expect(tableBlocks).toHaveLength(1);
        expect(textBlocks).toHaveLength(1);
    });
});
