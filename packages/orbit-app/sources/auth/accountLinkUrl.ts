import type { AuthCredentials } from '@/auth/tokenStorage';
import { authAccountApprove } from '@/auth/authAccountApprove';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { getServerUrl } from '@/sync/serverConfig';
import { buildLegacyAccountAuthUrl, getAccountAuthPrefixes } from '@/utils/appUrlScheme';

export const ACCOUNT_AUTH_BRIDGE_PATH = '/link/account';

function getBridgeAccountLinkPayload(url: string): string | null {
    try {
        const parsed = new URL(url);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:')
            && parsed.pathname.replace(/\/+$/, '') === ACCOUNT_AUTH_BRIDGE_PATH) {
            return parsed.searchParams.get('publicKey');
        }
    } catch {
        return null;
    }

    return null;
}

export function buildAccountLinkUrl(publicKey: string): string {
    try {
        const bridgeUrl = new URL(ACCOUNT_AUTH_BRIDGE_PATH, getServerUrl());
        bridgeUrl.searchParams.set('publicKey', publicKey);
        return bridgeUrl.toString();
    } catch {
        return buildLegacyAccountAuthUrl(publicKey);
    }
}

export function isAccountLinkUrl(url: string): boolean {
    return getAccountAuthPrefixes().some((prefix) => url.startsWith(prefix))
        || getBridgeAccountLinkPayload(url) !== null;
}

function getAccountLinkPayload(url: string): string {
    const matchingPrefix = getAccountAuthPrefixes().find((prefix) => url.startsWith(prefix));
    if (matchingPrefix) {
        return url.slice(matchingPrefix.length);
    }

    const bridgePayload = getBridgeAccountLinkPayload(url);
    if (bridgePayload) {
        return bridgePayload;
    }

    throw new Error('Invalid account link URL');
}

export async function approveAccountLinkUrl(credentials: AuthCredentials, url: string) {
    if (!isAccountLinkUrl(url)) {
        throw new Error('Invalid account link URL');
    }

    const tail = getAccountLinkPayload(url);
    const publicKey = decodeBase64(tail, 'base64url');
    const response = encryptBox(decodeBase64(credentials.secret, 'base64url'), publicKey);
    await authAccountApprove(credentials.token, publicKey, response);
}
