import type { Session } from '@/sync/storageTypes';
import { getNativeCliSessionTarget } from '@/utils/nativeCliSessionResolver';
import { openNativeCliSessionFromSession } from '@/utils/openNativeCliSession';
import { OrbitError } from '@/utils/errors';

function isNativeCliFlavorSession(session: Session): boolean {
    const flavor = session.metadata?.flavor;
    return flavor === 'claude' || flavor === 'codex' || flavor === 'gemini';
}

export async function resolveSendTargetSessionId(session: Session): Promise<string> {
    if (!getNativeCliSessionTarget(session) && !isNativeCliFlavorSession(session)) {
        return session.id;
    }

    const resolvedSessionId = await openNativeCliSessionFromSession(session);
    if (resolvedSessionId) {
        return resolvedSessionId;
    }

    throw new OrbitError(
        'Native CLI session is no longer available on this machine',
        true,
    );
}
