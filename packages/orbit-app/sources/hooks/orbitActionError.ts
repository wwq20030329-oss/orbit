import { OrbitError } from '@/utils/errors';

function normalizeKnownOrbitActionErrorMessage(message: string): string {
    const normalizedMessage = message.trim().toLowerCase();
    if (
        normalizedMessage.includes('rpcmethodnotavailable')
        || normalizedMessage.includes('rpc method not available')
        || normalizedMessage.includes('method not available')
    ) {
        return 'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.';
    }

    return message;
}

export function getOrbitActionErrorMessage(error: unknown): string {
    if (error instanceof OrbitError) {
        return normalizeKnownOrbitActionErrorMessage(error.message);
    }

    if (error instanceof Error) {
        const message = error.message.trim();
        return message.length > 0 ? normalizeKnownOrbitActionErrorMessage(message) : 'Unknown error';
    }

    if (typeof error === 'string') {
        const message = error.trim();
        return message.length > 0 ? normalizeKnownOrbitActionErrorMessage(message) : 'Unknown error';
    }

    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return normalizeKnownOrbitActionErrorMessage(message.trim());
        }
    }

    return 'Unknown error';
}
