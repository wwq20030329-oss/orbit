import type { Session } from '@/sync/storageTypes';
import { getNativeCliSessionTarget } from './nativeCliSessionResolver';

export const MOBILE_CONNECTION_STABILITY_GRACE_MS = 2_500;

const sessionConnectionSnapshots = new Map<string, number>();

function getSnapshotKey(session: Session, sessionId: string): string {
    const target = getNativeCliSessionTarget(session);
    if (!target) {
        return `session:${sessionId}`;
    }

    return `${target.machineId}:${target.tool}:${target.backendId}`;
}

export function rememberStableSessionConnection(params: {
    session: Session;
    sessionId: string;
    rawDisconnected: boolean;
    now?: number;
}) {
    if (params.rawDisconnected) {
        return;
    }

    sessionConnectionSnapshots.set(
        getSnapshotKey(params.session, params.sessionId),
        params.now ?? Date.now(),
    );
}

export function shouldHoldConnectedUi(params: {
    session: Session;
    sessionId: string;
    rawDisconnected: boolean;
    nativeConnectionPending?: boolean;
    lifecycleState?: string | null;
    now?: number;
}): boolean {
    const {
        session,
        sessionId,
        rawDisconnected,
        nativeConnectionPending = false,
        lifecycleState = null,
        now = Date.now(),
    } = params;

    if (nativeConnectionPending) {
        return false;
    }

    if (!rawDisconnected) {
        return false;
    }

    if (lifecycleState !== 'running') {
        return false;
    }

    const lastConnectedAt = sessionConnectionSnapshots.get(getSnapshotKey(session, sessionId)) ?? null;
    if (!lastConnectedAt || !Number.isFinite(lastConnectedAt)) {
        return false;
    }

    return now - lastConnectedAt < MOBILE_CONNECTION_STABILITY_GRACE_MS;
}

export function clearSessionConnectionSnapshots() {
    sessionConnectionSnapshots.clear();
}
