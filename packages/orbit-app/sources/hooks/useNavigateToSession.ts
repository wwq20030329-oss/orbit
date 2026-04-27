import type { Router } from 'expo-router';
import { useRouter } from 'expo-router';
import { OrbitSessionHistoryLoader } from '@/remote/OrbitSessionHistoryLoader';
import { storage } from '@/sync/storage';
import { trackSessionSwitched } from '@/track';
import { clearSessionOpenedAsHistoryOnly, isNativeCliResumeUnavailableError, isNativeCliSessionMissingError, openNativeCliSessionFromIdentifier, openNativeCliSessionFromSession, rememberNativeCliHintsForSession } from '@/utils/openNativeCliSession';
import { getNativeCliSessionTarget } from '@/utils/nativeCliSessionResolver';
import {
    navigateToPhoneWorkspaceSession,
    rememberLastOpenedSessionIdentifier,
    replaceToPhoneWorkspaceSession,
    shouldUsePhoneWorkspaceNavigation,
} from '@/utils/phoneWorkspaceNavigation';
import { getInitialSessionRouteResolution, resolveSessionRoute } from '@/utils/sessionRouteResolution';

const SESSION_NAVIGATION_HYDRATION_ATTEMPTS = 8;
const SESSION_NAVIGATION_HYDRATION_DELAY_MS = 150;

export interface NavigateToSessionOptions {
    preferHistoryEntry?: boolean;
}

type DirectSessionNavigationOptions = {
    history?: boolean;
};

function trackSession(sessionId: string) {
    const session = storage.getState().sessions[sessionId];
    if (session) {
        trackSessionSwitched(session);
    }
}

function shouldPreserveArchivedHistorySession(sessionId: string, options: NavigateToSessionOptions = {}): boolean {
    if (options.preferHistoryEntry !== true) {
        return false;
    }

    const session = storage.getState().sessions[sessionId];
    if (!session || session.metadata?.lifecycleState !== 'archived') {
        return false;
    }

    return getNativeCliSessionTarget(session) !== null;
}

function openPhoneWorkspaceSession(
    router: Router,
    sessionId: string,
    method: 'navigate' | 'replace',
) {
    clearSessionOpenedAsHistoryOnly(sessionId);
    trackSession(sessionId);

    if (method === 'replace') {
        replaceToPhoneWorkspaceSession(router, sessionId);
        return;
    }

    navigateToPhoneWorkspaceSession(router, sessionId);
}

function buildSessionRoute(sessionId: string, options: DirectSessionNavigationOptions = {}): string {
    const baseRoute = `/session/${encodeURIComponent(sessionId)}`;
    return options.history ? `${baseRoute}?history=1` : baseRoute;
}

export function navigateDirectlyToSession(
    router: Router,
    sessionId: string,
    options: DirectSessionNavigationOptions = {},
) {
    if (shouldUsePhoneWorkspaceNavigation() && storage.getState().sessions[sessionId]) {
        openPhoneWorkspaceSession(router, sessionId, 'navigate');
        return;
    }

    rememberLastOpenedSessionIdentifier(sessionId);
    trackSession(sessionId);
    router.navigate(buildSessionRoute(sessionId, options) as never, {
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

    return true;
}

async function waitForSessionToHydrate(sessionId: string): Promise<boolean> {
    if (storage.getState().sessions[sessionId]) {
        return true;
    }

    return new OrbitSessionHistoryLoader(sessionId).waitUntilReady({
        timeoutMs: SESSION_NAVIGATION_HYDRATION_ATTEMPTS * SESSION_NAVIGATION_HYDRATION_DELAY_MS,
        pollMs: SESSION_NAVIGATION_HYDRATION_DELAY_MS,
        allowFallbackRefresh: true,
    });
}

export function navigateToSession(
    router: Router,
    sessionId: string,
    options: NavigateToSessionOptions = {},
): Promise<void> {
    clearSessionOpenedAsHistoryOnly(sessionId);
    if (shouldPreserveArchivedHistorySession(sessionId, options)) {
        navigateDirectlyToSession(router, sessionId, { history: true });
        return Promise.resolve();
    }

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
    if (shouldUsePhoneWorkspaceNavigation() && storage.getState().sessions[sessionId]) {
        openPhoneWorkspaceSession(router, sessionId, 'replace');
        return;
    }

    rememberLastOpenedSessionIdentifier(sessionId);
    clearSessionOpenedAsHistoryOnly(sessionId);
    trackSession(sessionId);
    router.replace(`/session/${encodeURIComponent(sessionId)}`);
}

export function useNavigateToSession(): (
    sessionId: string,
    options?: NavigateToSessionOptions,
) => Promise<void> {
    const router = useRouter();
    return (sessionId: string, options?: NavigateToSessionOptions) => {
        return navigateToSession(router, sessionId, options);
    };
}

export function useNavigateDirectlyToSession() {
    const router = useRouter();
    return (sessionId: string, options?: DirectSessionNavigationOptions) => {
        navigateDirectlyToSession(router, sessionId, options);
    };
}
