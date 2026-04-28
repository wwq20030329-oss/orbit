import { MMKV } from 'react-native-mmkv';
import { normalizeServerUrl } from './serverUrlNormalize';
import { loadAppConfig } from './appConfig';

// Diagnostics storage persists across logouts, but server selection itself is
// intentionally no longer user-configurable inside the app.
const serverConfigStorage = new MMKV({ id: 'server-config' });

const LEGACY_SERVER_KEY = 'custom-server-url';
const LOG_SERVER_KEY = 'log-server-url';
const ACTIVE_SERVER_KEY = 'active-server-url';

// Defaults come from the build-time app config (see app.config.js). Production
// App Store bundles receive an empty fallback list, which means the app will
// NEVER auto-downgrade to plain HTTP. Keeping a hardcoded fallback in source
// previously caused Android production builds to silently send bearer tokens
// over cleartext if the HTTPS host was unreachable.
const BUILD_CONFIG = loadAppConfig();
const DEFAULT_SERVER_URL = BUILD_CONFIG.serverUrl || 'https://api.2003383.xyz';
const FALLBACK_SERVER_URLS: string[] = Array.isArray(BUILD_CONFIG.fallbackServerUrls)
    ? BUILD_CONFIG.fallbackServerUrls
    : [];
const SERVER_PROBE_TIMEOUT_MS = 4000;

function clearLegacyServerOverride(): void {
    const legacyUrl = serverConfigStorage.getString(LEGACY_SERVER_KEY);
    if (legacyUrl) {
        console.log(`[serverConfig] Clearing legacy persisted server override: ${legacyUrl}`);
        serverConfigStorage.delete(LEGACY_SERVER_KEY);
    }
}

clearLegacyServerOverride();

function getRuntimeServerUrl(): string | null {
    return process.env.EXPO_PUBLIC_SERVER_URL ||
        process.env.EXPO_PUBLIC_ORBIT_SERVER_URL ||
        null;
}

function normalizeCandidate(url: string): string {
    return normalizeServerUrl(url, true).replace(/\/$/, '');
}

function getConfiguredServerUrls(): string[] {
    const urls = [
        getRuntimeServerUrl() || DEFAULT_SERVER_URL,
        ...FALLBACK_SERVER_URLS,
    ];

    const deduped = new Set<string>();
    for (const url of urls) {
        if (!url?.trim()) {
            continue;
        }
        deduped.add(normalizeCandidate(url));
    }

    return Array.from(deduped);
}

export function getServerUrlCandidates(): string[] {
    const candidates = getConfiguredServerUrls();
    const active = serverConfigStorage.getString(ACTIVE_SERVER_KEY);
    if (!active) {
        return candidates;
    }

    const normalizedActive = normalizeCandidate(active);
    return [
        normalizedActive,
        ...candidates.filter(candidate => candidate !== normalizedActive),
    ];
}

function setActiveServerUrl(url: string | null): void {
    if (!url?.trim()) {
        serverConfigStorage.delete(ACTIVE_SERVER_KEY);
        return;
    }

    serverConfigStorage.set(ACTIVE_SERVER_KEY, normalizeCandidate(url));
}

export function getServerUrl(): string {
    return getServerUrlCandidates()[0] || normalizeCandidate(DEFAULT_SERVER_URL);
}

export function setServerUrl(url: string | null): void {
    if (url?.trim()) {
        console.warn('[serverConfig] Ignoring manual server override. Rebuild the app or set EXPO_PUBLIC_SERVER_URL before bundling.');
    }

    serverConfigStorage.delete(LEGACY_SERVER_KEY);
}

async function probeServerUrl(serverUrl: string): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => controller.abort(), SERVER_PROBE_TIMEOUT_MS)
        : null;

    try {
        const healthUrl = new URL('/health', serverUrl).toString();
        const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller?.signal,
        });

        return response.ok;
    } catch (error) {
        console.warn(`[serverConfig] Failed probing ${serverUrl}:`, error);
        return false;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export async function ensureReachableServerUrl(): Promise<string> {
    const candidates = getServerUrlCandidates();

    for (const candidate of candidates) {
        if (await probeServerUrl(candidate)) {
            setActiveServerUrl(candidate);
            return candidate;
        }
    }

    const fallback = candidates[0] || normalizeCandidate(DEFAULT_SERVER_URL);
    setActiveServerUrl(fallback);
    return fallback;
}

export function getLogServerUrl(): string | null {
    return serverConfigStorage.getString(LOG_SERVER_KEY) ||
           process.env.EXPO_PUBLIC_LOG_SERVER_URL ||
           null;
}

export function setLogServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(LOG_SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(LOG_SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}
