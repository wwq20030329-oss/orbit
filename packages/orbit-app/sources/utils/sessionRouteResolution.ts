import {
    resolveCanonicalSessionId,
    resolveExistingCanonicalSessionId,
} from '@/utils/openNativeCliSession';

export interface SessionRouteResolution {
    initialSessionId: string | null;
    resolvedSessionId: string | null;
    shouldReplaceRoute: boolean;
}

export function getInitialSessionRouteResolution(identifier: string): SessionRouteResolution {
    const existingSessionId = resolveExistingCanonicalSessionId(identifier);

    return {
        initialSessionId: existingSessionId,
        resolvedSessionId: existingSessionId,
        shouldReplaceRoute: false,
    };
}

export async function resolveSessionRoute(identifier: string): Promise<SessionRouteResolution> {
    const initialSessionId = resolveExistingCanonicalSessionId(identifier);
    const canonicalSessionId = await resolveCanonicalSessionId(identifier);
    const resolvedSessionId = canonicalSessionId ?? initialSessionId;

    return {
        initialSessionId,
        resolvedSessionId,
        shouldReplaceRoute: canonicalSessionId !== null && canonicalSessionId !== identifier,
    };
}
