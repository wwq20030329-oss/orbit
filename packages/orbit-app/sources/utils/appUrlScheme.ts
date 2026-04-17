import { config } from '@/config';

const LEGACY_URL_SCHEME = 'orbit';

function unique(values: string[]): string[] {
    return values.filter((value, index) => values.indexOf(value) === index);
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
        `${LEGACY_URL_SCHEME}://terminal?`,
    ]);
}

export function getTerminalAuthPlaceholder(): string {
    return `${getAppUrlScheme()}://terminal?...`;
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
