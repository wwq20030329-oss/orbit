export function refreshSessionEncryptionCache(
    sessionEncryptions: Map<string, unknown>,
    cache: { clearSessionCache: (sessionId: string) => void },
    sessionId: string,
): void {
    if (!sessionEncryptions.has(sessionId)) {
        return;
    }

    sessionEncryptions.delete(sessionId);
    cache.clearSessionCache(sessionId);
}
