export class VisibleSessionTracker {
    private readonly counts = new Map<string, number>();
    private readonly versions = new Map<string, number>();

    private bumpVersion(sessionId: string) {
        const next = (this.versions.get(sessionId) ?? 0) + 1;
        this.versions.set(sessionId, next);
        return next;
    }

    markVisible(sessionId: string): boolean {
        const next = (this.counts.get(sessionId) ?? 0) + 1;
        this.counts.set(sessionId, next);
        if (next === 1) {
            this.bumpVersion(sessionId);
        }
        return next === 1;
    }

    markHidden(sessionId: string): boolean {
        const current = this.counts.get(sessionId) ?? 0;
        if (current <= 1) {
            this.counts.delete(sessionId);
            if (current > 0) {
                this.bumpVersion(sessionId);
            }
            return current > 0;
        }

        this.counts.set(sessionId, current - 1);
        return true;
    }

    isVisible(sessionId: string): boolean {
        return (this.counts.get(sessionId) ?? 0) > 0;
    }

    listVisible(): string[] {
        return Array.from(this.counts.keys());
    }

    getVersion(sessionId: string): number {
        return this.versions.get(sessionId) ?? 0;
    }
}
