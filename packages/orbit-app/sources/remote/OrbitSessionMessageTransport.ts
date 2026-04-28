import type { MessageSentSource } from '@/track';
import { sync } from '@/sync/sync';
import type { Session } from '@/sync/storageTypes';
import { resolveSendTargetSessionId } from '@/-session/resolveSendTargetSession';

export type OrbitSessionOutgoingMessage = {
    content: string;
    displayText?: string;
    source?: MessageSentSource;
};

type OrbitSessionMessageTransportDependencies = {
    resolveTargetSessionId: (session: Session) => Promise<string>;
    sendMessage: (
        sessionId: string,
        text: string,
        options?: { displayText?: string; source?: MessageSentSource },
    ) => Promise<void> | void;
};

const defaultDependencies: OrbitSessionMessageTransportDependencies = {
    resolveTargetSessionId: resolveSendTargetSessionId,
    sendMessage: sync.sendMessage.bind(sync),
};

export interface OrbitSessionMessageTransportLike {
    send(
        session: Session,
        message: OrbitSessionOutgoingMessage,
    ): Promise<string>;
}

export class OrbitSessionMessageTransport implements OrbitSessionMessageTransportLike {
    constructor(
        private readonly dependencies: OrbitSessionMessageTransportDependencies = defaultDependencies,
    ) {}

    async send(
        session: Session,
        message: OrbitSessionOutgoingMessage,
    ): Promise<string> {
        const targetSessionId = await this.dependencies.resolveTargetSessionId(session);
        await this.dependencies.sendMessage(targetSessionId, message.content, {
            displayText: message.displayText,
            source: message.source ?? 'chat',
        });
        return targetSessionId;
    }
}
