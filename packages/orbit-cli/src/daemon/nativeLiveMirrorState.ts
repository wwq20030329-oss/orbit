export type NativeLiveMirrorSessionClient = {
    sendSessionDeath: () => void;
    flush: () => Promise<void>;
    close: () => Promise<void>;
};

export async function pruneNativeLiveMirrorClients(
    liveKeys: Set<string>,
    clients: Map<string, NativeLiveMirrorSessionClient>,
    counts: Map<string, number>,
): Promise<void> {
    for (const [key, client] of clients.entries()) {
        if (liveKeys.has(key)) {
            continue;
        }

        client.sendSessionDeath();
        await client.flush();
        await client.close();
        clients.delete(key);
        counts.delete(key);
    }
}
