import {
    resolveCanonicalSessionId,
    resolveExistingCanonicalSessionId,
    resolveExistingDisplaySessionId,
} from '@/utils/openNativeCliSession';

export interface SessionRouteResolution {
    initialSessionId: string | null;
    displaySessionId: string | null;
    resolvedSessionId: string | null;
    shouldReplaceRoute: boolean;
}

export function getInitialSessionRouteResolution(identifier: string): SessionRouteResolution {
    const existingSessionId = resolveExistingCanonicalSessionId(identifier);
    const displaySessionId = resolveExistingDisplaySessionId(identifier);

    return {
        initialSessionId: existingSessionId,
        displaySessionId,
        resolvedSessionId: existingSessionId,
        shouldReplaceRoute: false,
    };
}

export async function resolveSessionRoute(identifier: string): Promise<SessionRouteResolution> {
    const initialSessionId = resolveExistingCanonicalSessionId(identifier);
    const displaySessionId = resolveExistingDisplaySessionId(identifier);
    const canonicalSessionId = await resolveCanonicalSessionId(identifier);
    const resolvedSessionId = canonicalSessionId ?? initialSessionId;

    return {
        initialSessionId,
        displaySessionId,
        resolvedSessionId,
        shouldReplaceRoute: canonicalSessionId !== null && canonicalSessionId !== identifier,
    };
}
