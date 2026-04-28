export type FileChangeSummaryItem = {
    path: string;
    label?: string;
    disabled?: boolean;
};

export function summarizeFileChangeItems(
    items: FileChangeSummaryItem[],
    maxVisible: number = 6,
): {
    visibleItems: FileChangeSummaryItem[];
    hiddenCount: number;
} {
    const deduped = new Map<string, FileChangeSummaryItem>();

    for (const item of items) {
        if (!item.path) continue;
        if (!deduped.has(item.path)) {
            deduped.set(item.path, item);
        }
    }

    const uniqueItems = [...deduped.values()];

    return {
        visibleItems: uniqueItems.slice(0, maxVisible),
        hiddenCount: Math.max(0, uniqueItems.length - maxVisible),
    };
}

export function getDefaultFileChangeLabel(path: string): string {
    const segments = path.split('/');
    return segments[segments.length - 1] || path;
}
