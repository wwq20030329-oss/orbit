import type { Session } from '@/sync/storageTypes';
import { storage } from '@/sync/storage';
import {
    OrbitSessionControlChannel,
    type OrbitSessionControlChannelLike,
    type OrbitSessionAllowDecision,
    type OrbitSessionDenyDecision,
    type OrbitSessionPermissionMode,
} from './OrbitSessionControlChannel';
import {
    OrbitSessionMessageTransport,
    type OrbitSessionMessageTransportLike,
    type OrbitSessionOutgoingMessage,
} from './OrbitSessionMessageTransport';
import {
    OrbitSessionConnection,
    type OrbitSessionConnectionLike,
} from './OrbitSessionConnection';
import {
    OrbitSessionHistoryLoader,
    type OrbitSessionHistoryLoaderLike,
    type OrbitSessionReadinessOptions,
} from './OrbitSessionHistoryLoader';

export type OrbitRemoteSessionCallbacks = {
    onSessionRouted?: (sessionId: string) => void;
    onBackgroundError?: (error: unknown) => void;
};

export class OrbitRemoteSessionManager {
    private readonly connection: OrbitSessionConnectionLike;
    private readonly messageTransport: OrbitSessionMessageTransportLike;
    private readonly controlChannel: OrbitSessionControlChannelLike;
    private readonly historyLoader: OrbitSessionHistoryLoaderLike;

    constructor(
        private readonly sessionId: string,
        private readonly callbacks: OrbitRemoteSessionCallbacks = {},
        options: {
            connection?: OrbitSessionConnectionLike;
            messageTransport?: OrbitSessionMessageTransportLike;
            controlChannel?: OrbitSessionControlChannelLike;
            historyLoader?: OrbitSessionHistoryLoaderLike;
        } = {},
    ) {
        this.connection = options.connection ?? new OrbitSessionConnection(sessionId, {
            onBackgroundError: callbacks.onBackgroundError,
        });
        this.messageTransport = options.messageTransport ?? new OrbitSessionMessageTransport();
        this.controlChannel = options.controlChannel ?? new OrbitSessionControlChannel(sessionId);
        this.historyLoader = options.historyLoader ?? new OrbitSessionHistoryLoader(sessionId);
    }

    getSessionId(): string {
        return this.sessionId;
    }

    connect(): void {
        this.connection.connect();
    }

    disconnect(): void {
        this.connection.disconnect();
    }

    reconnect(): void {
        this.connection.reconnect();
    }

    async waitUntilReady(options?: OrbitSessionReadinessOptions): Promise<boolean> {
        return this.historyLoader.waitUntilReady(options);
    }

    async refreshHistory(): Promise<void> {
        await this.historyLoader.refresh();
    }

    async refreshHistoryIfStale(): Promise<void> {
        await this.historyLoader.refreshIfStale();
    }

    async sendMessage(session: Session, message: OrbitSessionOutgoingMessage): Promise<string> {
        const targetSessionId = await this.messageTransport.send(session, message);
        if (targetSessionId !== this.sessionId) {
            this.callbacks.onSessionRouted?.(targetSessionId);
        }
        return targetSessionId;
    }

    async sendCurrentSessionMessage(message: OrbitSessionOutgoingMessage): Promise<string> {
        const session = storage.getState().sessions[this.sessionId];
        if (!session) {
            throw new Error(`Session ${this.sessionId} not found`);
        }

        return this.sendMessage(session, message);
    }

    async cancelSession(): Promise<void> {
        await this.controlChannel.abort();
    }

    async allowPermission(
        permissionId: string,
        options: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionAllowDecision;
        } = {},
    ): Promise<void> {
        await this.controlChannel.allowPermission(permissionId, options);
    }

    async denyPermission(
        permissionId: string,
        options: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionDenyDecision;
        } = {},
    ): Promise<void> {
        await this.controlChannel.denyPermission(permissionId, options);
    }
}
