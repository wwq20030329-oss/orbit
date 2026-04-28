import {
    resolveCanonicalSessionId,
    resolveExistingCanonicalSessionId,
    resolveExistingDisplaySessionId,
} from '@/utils/openNativeCliSession';

const SESSION_ROUTE_RESOLUTION_TIMEOUT_MS = 1_500;

export interface SessionRouteResolution {
    initialSessionId: string | null;
    displaySessionId: string | null;
    resolvedSessionId: string | null;
    shouldReplaceRoute: boolean;
}

async function resolveCanonicalSessionIdWithTimeout(identifier: string): Promise<string | null> {
    return await new Promise((resolve) => {
        let settled = false;

        const timeout = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;
            resolve(null);
        }, SESSION_ROUTE_RESOLUTION_TIMEOUT_MS);

        void resolveCanonicalSessionId(identifier)
            .then((sessionId) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                resolve(sessionId);
            })
            .catch(() => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                resolve(null);
            });
    });
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
    const canonicalSessionId = await resolveCanonicalSessionIdWithTimeout(identifier);
    const resolvedSessionId = canonicalSessionId ?? initialSessionId;

    return {
        initialSessionId,
        displaySessionId,
        resolvedSessionId,
        shouldReplaceRoute: canonicalSessionId !== null && canonicalSessionId !== identifier,
    };
}
