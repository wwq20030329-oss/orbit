import type { Router } from 'expo-router';
import { useRouter } from 'expo-router';
import { storage } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { trackSessionSwitched } from '@/track';
import { clearSessionOpenedAsHistoryOnly, isNativeCliResumeUnavailableError, isNativeCliSessionMissingError, openNativeCliSessionFromIdentifier, openNativeCliSessionFromSession, rememberNativeCliHintsForSession } from '@/utils/openNativeCliSession';
import { getNativeCliSessionTarget } from '@/utils/nativeCliSessionResolver';
import { getInitialSessionRouteResolution, resolveSessionRoute } from '@/utils/sessionRouteResolution';

const SESSION_NAVIGATION_HYDRATION_ATTEMPTS = 8;
const SESSION_NAVIGATION_HYDRATION_DELAY_MS = 150;

function trackSession(sessionId: string) {
    const session = storage.getState().sessions[sessionId];
    if (session) {
        trackSessionSwitched(session);
    }
}

export function navigateDirectlyToSession(router: Router, sessionId: string) {
    trackSession(sessionId);
    router.navigate(`/session/${encodeURIComponent(sessionId)}`, {
        dangerouslySingular() {
            return 'session';
        },
    });
}

function shouldPreferNativeCliNavigation(sessionId: string): boolean {
    const session = storage.getState().sessions[sessionId];
    if (!session) {
        return false;
    }

    const flavor = session.metadata?.flavor;
    const isNativeFlavor = flavor === 'claude' || flavor === 'codex' || flavor === 'gemini';
    if (!getNativeCliSessionTarget(session) && !isNativeFlavor) {
        return false;
    }

    return session.metadata?.lifecycleState !== 'archived';
}

async function waitForSessionToHydrate(sessionId: string): Promise<boolean> {
    if (storage.getState().sessions[sessionId]) {
        return true;
    }

    return sync.waitForSessionReady(sessionId, {
        timeoutMs: SESSION_NAVIGATION_HYDRATION_ATTEMPTS * SESSION_NAVIGATION_HYDRATION_DELAY_MS,
        pollMs: SESSION_NAVIGATION_HYDRATION_DELAY_MS,
        allowFallbackRefresh: true,
    });
}

export function navigateToSession(router: Router, sessionId: string): Promise<void> {
    clearSessionOpenedAsHistoryOnly(sessionId);
    const session = storage.getState().sessions[sessionId];
    if (session && shouldPreferNativeCliNavigation(sessionId)) {
        rememberNativeCliHintsForSession(session);

        const nativeTarget = getNativeCliSessionTarget(session);
        const fallbackIdentifier = nativeTarget ? `${nativeTarget.tool}:${nativeTarget.backendId}` : null;
        const navigateWithResolvedSession = async () => {
            try {
                let resolvedSessionId = await openNativeCliSessionFromSession(session);
                if (!resolvedSessionId && fallbackIdentifier) {
                    resolvedSessionId = await openNativeCliSessionFromIdentifier(fallbackIdentifier);
                }

                const targetSessionId = resolvedSessionId ?? sessionId;
                if (!storage.getState().sessions[targetSessionId]) {
                    const hydrated = await waitForSessionToHydrate(targetSessionId);
                    if (!hydrated && storage.getState().sessions[sessionId]) {
                        navigateDirectlyToSession(router, sessionId);
                        return;
                    }
                }

                navigateDirectlyToSession(router, targetSessionId);
            } catch (error) {
                if (isNativeCliResumeUnavailableError(error) || isNativeCliSessionMissingError(error)) {
                    navigateDirectlyToSession(router, sessionId);
                    return;
                }

                console.warn('Failed to resolve native CLI session during navigation', error);
                navigateDirectlyToSession(router, sessionId);
            }
        };

        return navigateWithResolvedSession();
    }

    const initialRouteResolution = getInitialSessionRouteResolution(sessionId);
    if (initialRouteResolution.resolvedSessionId) {
        navigateDirectlyToSession(router, initialRouteResolution.resolvedSessionId);
        return Promise.resolve();
    }

    navigateDirectlyToSession(router, sessionId);

    const navigateWithCanonicalSession = async () => {
        try {
            const routeResolution = await resolveSessionRoute(sessionId);
            const targetSessionId = routeResolution.resolvedSessionId ?? sessionId;

            if (targetSessionId === sessionId || !routeResolution.shouldReplaceRoute) {
                return;
            }

            if (!storage.getState().sessions[targetSessionId]) {
                const hydrated = await waitForSessionToHydrate(targetSessionId);
                if (!hydrated) {
                    return;
                }
            }

            replaceToSession(router, targetSessionId);
        } catch (error) {
            console.warn('Failed to resolve canonical session during navigation', error);
        }
    };

    return navigateWithCanonicalSession();
}

export function replaceToSession(router: Router, sessionId: string) {
    clearSessionOpenedAsHistoryOnly(sessionId);
    trackSession(sessionId);
    router.replace(`/session/${encodeURIComponent(sessionId)}`);
}

export function useNavigateToSession(): (sessionId: string) => Promise<void> {
    const router = useRouter();
    return (sessionId: string) => {
        return navigateToSession(router, sessionId);
    };
}

export function useNavigateDirectlyToSession() {
    const router = useRouter();
    return (sessionId: string) => {
        navigateDirectlyToSession(router, sessionId);
    };
}
