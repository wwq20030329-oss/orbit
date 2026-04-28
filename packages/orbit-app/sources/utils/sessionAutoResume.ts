export function shouldAutoResumeSession(params: {
    isDisconnected: boolean;
    canShowResume: boolean;
    canResume: boolean;
    resumingSession: boolean;
    nativeConnectionPending?: boolean;
    isInactiveArchivedSession?: boolean;
}): boolean {
    return Boolean(
        params.isDisconnected
        && params.canShowResume
        && params.canResume
        && !params.resumingSession
        && !params.nativeConnectionPending
        && !params.isInactiveArchivedSession,
    );
}
