import type { Session } from '@/sync/storageTypes';
import type { Message } from '@/sync/typesMessage';
import { getNativeCliSessionTarget } from './nativeCliSessionResolver';

type SessionMessageSnapshot = {
    messages: Message[];
    isLoaded: boolean;
    rememberedAt: number;
};

const sessionMessageSnapshots = new Map<string, SessionMessageSnapshot>();

export const MOBILE_MESSAGE_STABILITY_GRACE_MS = 5_000;

function getSnapshotKey(session: Session, sessionId: string): string {
    const target = getNativeCliSessionTarget(session);
    if (!target) {
        return `session:${sessionId}`;
    }

    return `${target.machineId}:${target.tool}:${target.backendId}`;
}

export function rememberStableSessionMessages(params: {
    session: Session;
    sessionId: string;
    messages: Message[];
    isLoaded: boolean;
    now?: number;
}) {
    if (!params.isLoaded && params.messages.length === 0) {
        return;
    }

    const snapshotKey = getSnapshotKey(params.session, params.sessionId);
    const existingSnapshot = sessionMessageSnapshots.get(snapshotKey);
    if (
        existingSnapshot
        && existingSnapshot.messages === params.messages
        && existingSnapshot.isLoaded === params.isLoaded
    ) {
        return;
    }

    sessionMessageSnapshots.set(snapshotKey, {
        messages: params.messages,
        isLoaded: params.isLoaded,
        rememberedAt: params.now ?? Date.now(),
    });
}

export function getStableSessionMessages(params: {
    session: Session;
    sessionId: string;
    messages: Message[];
    isLoaded: boolean;
    now?: number;
}): { messages: Message[]; isLoaded: boolean } {
    if (params.messages.length > 0 || params.isLoaded) {
        return {
            messages: params.messages,
            isLoaded: params.isLoaded,
        };
    }

    const snapshotKey = getSnapshotKey(params.session, params.sessionId);
    const snapshot = sessionMessageSnapshots.get(snapshotKey);
    if (!snapshot) {
        return {
            messages: params.messages,
            isLoaded: params.isLoaded,
        };
    }

    if ((params.now ?? Date.now()) - snapshot.rememberedAt >= MOBILE_MESSAGE_STABILITY_GRACE_MS) {
        sessionMessageSnapshots.delete(snapshotKey);
        return {
            messages: params.messages,
            isLoaded: params.isLoaded,
        };
    }

    return {
        messages: snapshot.messages,
        isLoaded: snapshot.isLoaded,
    };
}

export function clearSessionMessageSnapshots() {
    sessionMessageSnapshots.clear();
}
