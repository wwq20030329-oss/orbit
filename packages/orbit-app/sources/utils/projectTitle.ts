export function buildProjectTitle(path: string | null): string | null {
    if (!path) {
        return null;
    }

    const normalized = path.replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    return segments.at(-1) ?? null;
}
