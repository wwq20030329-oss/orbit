import type { MarkdownBlock, MarkdownSpan } from "./parseMarkdown";
import { parseMarkdownSpans } from "./parseMarkdownSpans";

// Split a pipe-delimited table row into cells, stripping only the leading/trailing
// empty strings caused by outer pipes while preserving interior empty cells.
function splitTableRow(line: string): string[] {
    let cells = line.trim().split('|').map(cell => cell.trim());
    if (cells.length > 0 && cells[0] === '') cells = cells.slice(1);
    if (cells.length > 0 && cells[cells.length - 1] === '') cells = cells.slice(0, -1);
    return cells;
}

function parseTable(lines: string[], startIndex: number): { table: MarkdownBlock | null; nextIndex: number } {
    let index = startIndex;
    const tableLines: string[] = [];

    // Collect consecutive lines that contain pipe characters, skipping blank lines
    // that LLMs often insert between table rows
    while (index < lines.length) {
        if (lines[index].includes('|')) {
            tableLines.push(lines[index]);
            index++;
        } else if (lines[index].trim() === '') {
            index++;
        } else {
            break;
        }
    }

    if (tableLines.length < 2) {
        return { table: null, nextIndex: startIndex };
    }

    // Validate that the second line is a separator containing dashes, which distinguishes tables from plain text
    const separatorLine = tableLines[1].trim();
    const isSeparator = /^[|\s\-:=]*$/.test(separatorLine) && separatorLine.includes('-');

    if (!isSeparator) {
        return { table: null, nextIndex: startIndex };
    }

    const headers = splitTableRow(tableLines[0])
        .map(cell => parseMarkdownSpans(cell, false));

    if (headers.length === 0) {
        return { table: null, nextIndex: startIndex };
    }

    // Extract data rows from remaining lines (skipping the separator line)
    const rows: MarkdownSpan[][][] = [];
    for (let i = 2; i < tableLines.length; i++) {
        const rowCells = splitTableRow(tableLines[i])
            .map(cell => parseMarkdownSpans(cell, false));
        if (rowCells.length > 0) {
            rows.push(rowCells);
        }
    }

    const table: MarkdownBlock = {
        type: 'table',
        headers,
        rows
    };

    return { table, nextIndex: index };
}

/**
 * A block paired with the raw markdown substring it was parsed from.
 * The `source` string is everything from the first line of the block
 * through the last line consumed (joined with `\n`), and is used as the
 * cache key by the incremental block-level parser — see
 * `parseMarkdownIncremental.ts`. Source tracking lets streaming updates
 * skip re-parsing and re-rendering blocks whose markdown text did not
 * change, which is the dominant cost while an AI agent is producing
 * a long reply token by token.
 */
export interface MarkdownBlockWithSource {
    block: MarkdownBlock;
    source: string;
}

export function parseMarkdownBlock(markdown: string): MarkdownBlock[] {
    return parseMarkdownBlocksWithSources(markdown).map((entry) => entry.block);
}

export function parseMarkdownBlocksWithSources(markdown: string): MarkdownBlockWithSource[] {
    const results: MarkdownBlockWithSource[] = [];
    const lines = markdown.split('\n');
    let index = 0;

    outer: while (index < lines.length) {
        const blockStart = index;
        const line = lines[index];
        index++;

        const push = (block: MarkdownBlock) => {
            const source = lines.slice(blockStart, index).join('\n');
            results.push({ block, source });
        };

        // Headers
        for (let i = 1; i <= 6; i++) {
            if (line.startsWith(`${'#'.repeat(i)} `)) {
                push({ type: 'header', level: i as 1 | 2 | 3 | 4 | 5 | 6, content: parseMarkdownSpans(line.slice(i + 1).trim(), true) });
                continue outer;
            }
        }

        // Trim
        let trimmed = line.trim();

        // Code block
        if (trimmed.startsWith('```')) {
            const language = trimmed.slice(3).trim() || null;
            let content = [];
            while (index < lines.length) {
                const nextLine = lines[index];
                if (nextLine.trim() === '```') {
                    index++;
                    break;
                }
                content.push(nextLine);
                index++;
            }
            const contentString = content.join('\n');

            // Detect mermaid diagram language and route to appropriate block type
            if (language === 'mermaid') {
                push({ type: 'mermaid', content: contentString });
            } else {
                push({ type: 'code-block', language, content: contentString });
            }
            continue;
        }

        // Horizontal rule
        if (trimmed === '---') {
            push({ type: 'horizontal-rule' });
            continue;
        }

        // Options block
        if (trimmed.startsWith('<options>')) {
            let items: string[] = [];
            while (index < lines.length) {
                const nextLine = lines[index];
                if (nextLine.trim() === '</options>') {
                    index++;
                    break;
                }
                // Extract content from <option> tags
                const optionMatch = nextLine.match(/<option>(.*?)<\/option>/);
                if (optionMatch) {
                    items.push(optionMatch[1]);
                }
                index++;
            }
            if (items.length > 0) {
                push({ type: 'options', items });
            }
            continue;
        }

        // Image block
        const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
            push({ type: 'image', alt: imageMatch[1], url: imageMatch[2].trim() });
            continue;
        }

        // If it is a numbered list
        const numberedListMatch = trimmed.match(/^(\d+)\.\s+/);
        if (numberedListMatch) {
            let allLines = [{ number: parseInt(numberedListMatch[1]), content: trimmed.slice(numberedListMatch[0].length) }];
            while (index < lines.length) {
                const nextLine = lines[index].trim();
                const nextMatch = nextLine.match(/^(\d+)\.\s+/);
                if (!nextMatch) break;
                allLines.push({ number: parseInt(nextMatch[1]), content: nextLine.slice(nextMatch[0].length) });
                index++;
            }
            push({ type: 'numbered-list', items: allLines.map((l) => ({ number: l.number, spans: parseMarkdownSpans(l.content, false) })) });
            continue;
        }

        // If it is a list
        const listMatch = trimmed.match(/^([-*+])\s+/);
        if (listMatch) {
            let allLines = [trimmed.slice(listMatch[0].length)];
            while (index < lines.length) {
                const nextLine = lines[index].trim();
                const nextMatch = nextLine.match(/^([-*+])\s+/);
                if (!nextMatch) {
                    break;
                }
                allLines.push(nextLine.slice(nextMatch[0].length));
                index++;
            }
            push({ type: 'list', items: allLines.map((l) => parseMarkdownSpans(l, false)) });
            continue;
        }

        // Check for table
        if (trimmed.includes('|') && !trimmed.startsWith('```')) {
            const tableBlockStart = blockStart;
            const { table, nextIndex } = parseTable(lines, index - 1);
            if (table) {
                index = nextIndex;
                // Emit with full source covering the original first line
                // through the last consumed table row.
                const source = lines.slice(tableBlockStart, index).join('\n');
                results.push({ block: table, source });
                continue outer;
            }
        }

        // Fallback
        if (trimmed.length > 0) {
            push({ type: 'text', content: parseMarkdownSpans(trimmed, false) });
        }
    }
    return results;
}
