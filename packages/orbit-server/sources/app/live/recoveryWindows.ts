export const MACHINE_OFFLINE_GRACE_MS = 8_000;
export const SOCKET_CONNECTION_STATE_RECOVERY_MS = 2 * 60 * 1000;

export function resolveLiveAttachmentRecoveryGraceMs(connectionRecoveryWindowMs: number): number {
    // Live attachment state must survive at least as long as Socket.IO's
    // connection recovery window; otherwise a recovered socket can come back
    // without its runtime attachment and force the app down a refresh/loading
    // fallback path.
    return Math.max(0, connectionRecoveryWindowMs);
}

export function resolveMachineRuntimeDetachGraceMs(params: {
    machineOfflineGraceMs: number;
    liveAttachmentRecoveryGraceMs: number;
}): number {
    return Math.max(
        0,
        params.machineOfflineGraceMs,
        params.liveAttachmentRecoveryGraceMs,
    );
}
