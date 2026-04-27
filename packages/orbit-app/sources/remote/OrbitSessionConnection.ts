import { apiSocket } from '@/sync/apiSocket';
import { sync } from '@/sync/sync';
import {
    registerSessionRefreshHandler,
    type SessionRefreshReason,
} from './sessionRefreshRegistry';
import {
    OrbitSessionHistoryLoader,
    type OrbitSessionHistoryLoaderLike,
} from './OrbitSessionHistoryLoader';

type OrbitSessionConnectionDependencies = {
    onSessionVisible: (sessionId: string) => void;
    onSessionHidden: (sessionId: string) => void;
    createHistoryLoader: (sessionId: string) => OrbitSessionHistoryLoaderLike;
    onSocketStatusChange: (
        listener: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void,
    ) => () => void;
    registerRefreshHandler: (
        sessionId: string,
        handler: (reason: SessionRefreshReason) => void,
    ) => () => void;
};

export interface OrbitSessionConnectionLike {
    connect(): void;
    disconnect(): void;
    reconnect(): void;
}

const defaultDependencies: OrbitSessionConnectionDependencies = {
    onSessionVisible: sync.onSessionVisible,
    onSessionHidden: sync.onSessionHidden,
    createHistoryLoader: (sessionId) => new OrbitSessionHistoryLoader(sessionId),
    onSocketStatusChange: apiSocket.onStatusChange,
    registerRefreshHandler: registerSessionRefreshHandler,
};

export class OrbitSessionConnection implements OrbitSessionConnectionLike {
    private readonly historyLoader: OrbitSessionHistoryLoaderLike;
    private unsubscribeSocketStatus: (() => void) | null = null;
    private unsubscribeRefreshHandler: (() => void) | null = null;
    private refreshPromise: Promise<void> | null = null;
    private connected = false;

    constructor(
        private readonly sessionId: string,
        private readonly options: {
            onBackgroundError?: (error: unknown) => void;
        } = {},
        private readonly dependencies: OrbitSessionConnectionDependencies = defaultDependencies,
    ) {
        this.historyLoader = this.dependencies.createHistoryLoader(this.sessionId);
    }

    connect(): void {
        if (this.connected) {
            return;
        }

        this.connected = true;
        this.dependencies.onSessionVisible(this.sessionId);
        this.unsubscribeRefreshHandler = this.dependencies.registerRefreshHandler(
            this.sessionId,
            (reason) => {
                void this.refresh(reason);
            },
        );
        this.unsubscribeSocketStatus = this.dependencies.onSocketStatusChange((status) => {
            if (!this.connected || status !== 'connected') {
                return;
            }

            void this.refresh('socket-reconnected');
        });
    }

    disconnect(): void {
        if (!this.connected) {
            return;
        }

        this.connected = false;
        this.unsubscribeSocketStatus?.();
        this.unsubscribeSocketStatus = null;
        this.unsubscribeRefreshHandler?.();
        this.unsubscribeRefreshHandler = null;
        this.dependencies.onSessionHidden(this.sessionId);
    }

    reconnect(): void {
        if (!this.connected) {
            return;
        }

        void this.refresh('socket-reconnected');
    }

    private async refresh(reason: SessionRefreshReason): Promise<void> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        const refreshPromise = Promise.resolve(
            reason === 'realtime-message-gap' || reason === 'session-control-returned'
                ? this.historyLoader.refresh()
                : this.historyLoader.refreshIfStale(),
        )
            .catch((error) => {
                this.options.onBackgroundError?.(error);
            })
            .finally(() => {
                if (this.refreshPromise === refreshPromise) {
                    this.refreshPromise = null;
                }
            });

        this.refreshPromise = refreshPromise;
        return refreshPromise;
    }
}
