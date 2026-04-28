import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
    getServerUrl: vi.fn(),
    getAppUrlScheme: vi.fn(),
    buildLegacyAccountAuthUrl: vi.fn(),
    getAccountAuthPrefixes: vi.fn(() => ['orbit://account?']),
}));

vi.mock('@/sync/serverConfig', () => ({
    getServerUrl: hoisted.getServerUrl,
}));

vi.mock('@/utils/appUrlScheme', () => ({
    buildLegacyAccountAuthUrl: hoisted.buildLegacyAccountAuthUrl,
    getAccountAuthPrefixes: hoisted.getAccountAuthPrefixes,
    getAppUrlScheme: hoisted.getAppUrlScheme,
}));

vi.mock('@/auth/authAccountApprove', () => ({
    authAccountApprove: vi.fn(),
}));

vi.mock('@/encryption/base64', () => ({
    decodeBase64: vi.fn(),
}));

vi.mock('@/encryption/libsodium', () => ({
    encryptBox: vi.fn(),
}));

import { buildAccountLinkUrl } from './accountLinkUrl';

describe('buildAccountLinkUrl', () => {
    it('passes the current app scheme through the account link bridge URL', () => {
        hoisted.getServerUrl.mockReturnValue('https://orbit.example');
        hoisted.getAppUrlScheme.mockReturnValue('orbit-preview');

        expect(buildAccountLinkUrl('public-key-123')).toBe(
            'https://orbit.example/link/account?publicKey=public-key-123&scheme=orbit-preview',
        );
    });

    it('falls back to the legacy deep link when bridge URL creation fails', () => {
        hoisted.getServerUrl.mockImplementation(() => {
            throw new Error('missing server');
        });
        hoisted.getAppUrlScheme.mockReturnValue('orbit-preview');
        hoisted.buildLegacyAccountAuthUrl.mockReturnValue('orbit-preview:///account?public-key-123');

        expect(buildAccountLinkUrl('public-key-123')).toBe('orbit-preview:///account?public-key-123');
        expect(hoisted.buildLegacyAccountAuthUrl).toHaveBeenCalledWith('public-key-123');
    });
});
