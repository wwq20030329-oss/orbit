import { sync } from '@/sync/sync';

export type OrbitSessionReadinessOptions = {
    timeoutMs?: number;
    pollMs?: number;
    allowFallbackRefresh?: boolean;
};

type OrbitSessionHistoryLoaderDependencies = {
    waitUntilReady: (
        sessionId: string,
        options?: OrbitSessionReadinessOptions,
    ) => Promise<boolean>;
    refresh: (sessionId: string) => Promise<void> | void;
    refreshIfStale: (sessionId: string) => Promise<void> | void;
};

const defaultDependencies: OrbitSessionHistoryLoaderDependencies = {
    waitUntilReady: (sessionId, options) => {
        if (options) {
            return sync.waitForSessionReady(sessionId, options);
        }

        return sync.waitForSessionReady(sessionId);
    },
    refresh: (sessionId) => sync.refreshSessionMessages(sessionId),
    refreshIfStale: (sessionId) => sync.refreshSessionMessagesIfStale(sessionId),
};

export interface OrbitSessionHistoryLoaderLike {
    waitUntilReady(options?: OrbitSessionReadinessOptions): Promise<boolean>;
    refresh(): Promise<void>;
    refreshIfStale(): Promise<void>;
}

export class OrbitSessionHistoryLoader implements OrbitSessionHistoryLoaderLike {
    constructor(
        private readonly sessionId: string,
        private readonly dependencies: OrbitSessionHistoryLoaderDependencies = defaultDependencies,
    ) {}

    async waitUntilReady(options?: OrbitSessionReadinessOptions): Promise<boolean> {
        if (options) {
            return this.dependencies.waitUntilReady(this.sessionId, options);
        }

        return this.dependencies.waitUntilReady(this.sessionId);
    }

    async refresh(): Promise<void> {
        await this.dependencies.refresh(this.sessionId);
    }

    async refreshIfStale(): Promise<void> {
        await this.dependencies.refreshIfStale(this.sessionId);
    }
}
