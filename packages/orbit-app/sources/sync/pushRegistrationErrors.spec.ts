import { describe, expect, it } from 'vitest';
import {
    createMissingProjectIdError,
    getPushRegistrationFailureReason,
} from './pushRegistrationErrors';

describe('pushRegistrationErrors', () => {
    it('detects missing push capability errors from aps-environment entitlement failures', () => {
        const error = new Error('No valid "aps-environment" entitlement string found for application');
        expect(getPushRegistrationFailureReason(error)).toBe('missingPushCapability');
    });

    it('detects missing Expo project id errors', () => {
        expect(getPushRegistrationFailureReason(createMissingProjectIdError())).toBe('missingProjectId');
    });

    it('falls back to unknown for unrelated failures', () => {
        expect(getPushRegistrationFailureReason(new Error('Request failed with status 500'))).toBe('unknown');
    });
});

