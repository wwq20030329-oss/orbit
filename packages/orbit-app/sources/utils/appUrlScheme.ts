import { config } from '@/config';

const LEGACY_URL_SCHEME = 'orbit';
const TERMINAL_AUTH_ROUTE = 'terminal';

function unique(values: string[]): string[] {
    return values.filter((value, index) => values.indexOf(value) === index);
}

function trimSlashes(value: string): string {
    return value.replace(/^\/+|\/+$/g, '');
}

function decodeUrlComponentSafely(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function getAppUrlScheme(): string {
    return config.urlScheme?.trim() || LEGACY_URL_SCHEME;
}

export function buildTerminalAuthUrl(publicKey: string): string {
    return `${getAppUrlScheme()}://terminal?${publicKey}`;
}

export function getTerminalAuthPrefixes(): string[] {
    return unique([
        `${getAppUrlScheme()}://terminal?`,
        `${getAppUrlScheme()}:///terminal?`,
        `${LEGACY_URL_SCHEME}://terminal?`,
        `${LEGACY_URL_SCHEME}:///terminal?`,
    ]);
}

export function getTerminalAuthPlaceholder(): string {
    return `${getAppUrlScheme()}://terminal?...`;
}

export function getTerminalAuthPayload(url: string): string | null {
    const matchingPrefix = getTerminalAuthPrefixes().find((prefix) => url.startsWith(prefix));
    if (matchingPrefix) {
        const payload = url.slice(matchingPrefix.length).trim();
        return payload ? decodeUrlComponentSafely(payload) : null;
    }

    try {
        const parsed = new URL(url);
        const scheme = parsed.protocol.replace(/:$/, '');
        if (![getAppUrlScheme(), LEGACY_URL_SCHEME].includes(scheme)) {
            return null;
        }

        const route = trimSlashes(parsed.hostname || parsed.pathname);
        if (route !== TERMINAL_AUTH_ROUTE) {
            return null;
        }

        const payload = parsed.search.startsWith('?')
            ? parsed.search.slice(1).trim()
            : '';
        return payload ? decodeUrlComponentSafely(payload) : null;
    } catch {
        return null;
    }
}

export function isTerminalAuthUrl(url: string): boolean {
    return getTerminalAuthPayload(url) !== null;
}

export function getAccountAuthPrefixes(): string[] {
    const scheme = getAppUrlScheme();
    return unique([
        `${scheme}://account?`,
        `${scheme}:///account?`,
        `${LEGACY_URL_SCHEME}://account?`,
        `${LEGACY_URL_SCHEME}:///account?`,
    ]);
}

export function buildLegacyAccountAuthUrl(publicKey: string): string {
    return `${getAppUrlScheme()}:///account?${publicKey}`;
}
