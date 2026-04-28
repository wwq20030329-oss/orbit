import * as React from 'react';

import {
    OrbitRemoteSessionManager,
    type OrbitRemoteSessionCallbacks,
} from '@/remote/OrbitRemoteSessionManager';

export function useOrbitRemoteSessionManager(
    sessionId: string,
    callbacks?: OrbitRemoteSessionCallbacks,
): OrbitRemoteSessionManager;
export function useOrbitRemoteSessionManager(
    sessionId: null,
    callbacks?: OrbitRemoteSessionCallbacks,
): null;
export function useOrbitRemoteSessionManager(
    sessionId: string | null,
    callbacks?: OrbitRemoteSessionCallbacks,
): OrbitRemoteSessionManager | null;
export function useOrbitRemoteSessionManager(
    sessionId: string | null,
    callbacks: OrbitRemoteSessionCallbacks = {},
): OrbitRemoteSessionManager | null {
    const callbacksRef = React.useRef(callbacks);
    callbacksRef.current = callbacks;

    const managerRef = React.useRef<OrbitRemoteSessionManager | null>(null);
    const managerSessionIdRef = React.useRef<string | null>(null);

    if (!sessionId) {
        managerRef.current = null;
        managerSessionIdRef.current = null;
        return null;
    }

    if (!managerRef.current || managerSessionIdRef.current !== sessionId) {
        managerSessionIdRef.current = sessionId;
        managerRef.current = new OrbitRemoteSessionManager(sessionId, {
            onSessionRouted: (targetSessionId) => {
                callbacksRef.current.onSessionRouted?.(targetSessionId);
            },
            onBackgroundError: (error) => {
                callbacksRef.current.onBackgroundError?.(error);
            },
        });
    }

    return managerRef.current;
}
