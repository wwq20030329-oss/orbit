/**
 * Incremental, block-cached markdown parser for the chat view.
 *
 * Why this exists
 * ---------------
 * While an AI agent is streaming a reply the `markdown` string grows by
 * a few bytes per tick. The previous renderer called `parseMarkdown()`
 * on the full string every time, which means every already-settled
 * paragraph, code block, table, and list got re-parsed for the whole
 * reply on every token — a cost that scales linearly with the *length*
 * of the reply times the stream *rate*. For a 5 KB reply at ~100 tok/s
 * that is on the order of 500 ms of parse work per second of wall
 * clock, enough to turn a 60 fps feed into a slideshow on lower-end
 * phones.
 *
 * The incremental parser returns the same `MarkdownBlock[]` the old
 * pipeline did but it piggybacks on `parseMarkdownBlocksWithSources`
 * to obtain the raw markdown substring each block was parsed from, and
 * then memoizes the parsed block object behind a module-level LRU
 * keyed by that substring. A block whose source string has not changed
 * reuses the exact same `MarkdownBlock` reference as the previous
 * render, which also makes downstream `React.memo`'d block components
 * bail out of reconciliation in O(1).
 *
 * The cache is intentionally not global/infinite: long chats or
 * regenerations would otherwise hoard memory. A bounded LRU with
 * generous capacity (enough to comfortably hold a few thousand
 * paragraph-sized entries) is sufficient because block sources are
 * short and retention across a user session is the only goal.
 */

import type { MarkdownBlock } from './parseMarkdown';
import {
    parseMarkdownBlocksWithSources,
    type MarkdownBlockWithSource,
} from './parseMarkdownBlock';

/**
 * Insertion-ordered map works as an LRU because `Map.prototype.set`
 * puts the key at the tail on first insert and a delete+set refreshes
 * its position. The first key returned by `keys()` is the oldest.
 */
const blockCache = new Map<string, MarkdownBlock>();
const MAX_CACHE_ENTRIES = 2000;

function touchCacheEntry(source: string, block: MarkdownBlock): MarkdownBlock {
    // Refresh LRU order by re-inserting.
    blockCache.delete(source);
    blockCache.set(source, block);
    return block;
}

function cacheBlock(source: string, block: MarkdownBlock): void {
    if (blockCache.size >= MAX_CACHE_ENTRIES) {
        const firstKey = blockCache.keys().next().value;
        if (firstKey !== undefined) {
            blockCache.delete(firstKey);
        }
    }
    blockCache.set(source, block);
}

export function parseMarkdownIncremental(markdown: string): MarkdownBlockWithSource[] {
    const parsed = parseMarkdownBlocksWithSources(markdown);
    // Replace each freshly-parsed block with its cached equivalent when
    // we have seen the identical source substring before. This is what
    // keeps React reference equality across streaming ticks.
    return parsed.map((entry) => {
        const cached = blockCache.get(entry.source);
        if (cached) {
            touchCacheEntry(entry.source, cached);
            return { block: cached, source: entry.source };
        }
        cacheBlock(entry.source, entry.block);
        return entry;
    });
}

/**
 * Test/debugging helper — clears the in-memory cache. Not exported as
 * a behavioural API; production code should never need it.
 */
export function __resetMarkdownBlockCacheForTests(): void {
    blockCache.clear();
}
