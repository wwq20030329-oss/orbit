export type PushRegistrationFailureReason =
    | 'missingPushCapability'
    | 'missingProjectId'
    | 'unknown';

const MISSING_PROJECT_ID_SENTINEL = 'missing_expo_project_id';

export function createMissingProjectIdError(): Error {
    return new Error(MISSING_PROJECT_ID_SENTINEL);
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export function getPushRegistrationFailureReason(error: unknown): PushRegistrationFailureReason {
    const message = getErrorMessage(error);

    if (
        message.includes(MISSING_PROJECT_ID_SENTINEL) ||
        message.includes('projectId') ||
        message.includes('project ID')
    ) {
        return 'missingProjectId';
    }

    if (
        /aps-environment/i.test(message) ||
        /apns/i.test(message) ||
        /remote notification/i.test(message)
    ) {
        return 'missingPushCapability';
    }

    return 'unknown';
}

