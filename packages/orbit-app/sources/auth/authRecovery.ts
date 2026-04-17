import { getCurrentAuth } from './AuthContext';

let unauthorizedRecoveryPromise: Promise<void> | null = null;

export async function recoverFromUnauthorized(source: string): Promise<void> {
    const auth = getCurrentAuth();

    if (!auth?.isAuthenticated) {
        return;
    }

    if (unauthorizedRecoveryPromise) {
        return unauthorizedRecoveryPromise;
    }

    unauthorizedRecoveryPromise = (async () => {
        try {
            console.warn(`Unauthorized response received from ${source}, logging out to clear stale credentials.`);
            await auth.logout();
        } catch (error) {
            console.error(`Failed to recover from unauthorized response at ${source}:`, error);
        } finally {
            unauthorizedRecoveryPromise = null;
        }
    })();

    return unauthorizedRecoveryPromise;
}

export async function handleUnauthorizedResponse(response: Response, source: string): Promise<boolean> {
    if (response.status !== 401) {
        return false;
    }

    await recoverFromUnauthorized(source);
    return true;
}
