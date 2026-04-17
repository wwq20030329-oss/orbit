import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeServerUrl } from './serverUrlNormalize';

describe('normalizeServerUrl', () => {
    it('rewrites nip.io IPv4 hosts to direct IPs for native runtime', () => {
        expect(normalizeServerUrl('http://192-227-228-53.nip.io:3005', true)).toBe('http://192.227.228.53:3005');
    });

    it('keeps nip.io hostnames on web runtime', () => {
        expect(normalizeServerUrl('http://192-227-228-53.nip.io:3005', false)).toBe('http://192-227-228-53.nip.io:3005');
    });

    it('leaves unrelated hosts untouched', () => {
        expect(normalizeServerUrl('https://api.cluster-fluster.com', true)).toBe('https://api.cluster-fluster.com');
        expect(normalizeServerUrl('http://api.orbit.local:3005', true)).toBe('http://api.orbit.local:3005');
    });
});

const mmkvStores = new Map<string, Map<string, string>>();
const platform = { OS: 'ios' as 'ios' | 'android' | 'web' };
const originalEnv = { ...process.env };

vi.mock('react-native-mmkv', () => ({
    MMKV: class MockMMKV {
        private readonly store: Map<string, string>;

        constructor(options?: { id?: string }) {
            const id = options?.id ?? 'default';
            const existing = mmkvStores.get(id) ?? new Map<string, string>();
            mmkvStores.set(id, existing);
            this.store = existing;
        }

        getString(key: string): string | undefined {
            return this.store.get(key);
        }

        set(key: string, value: string): void {
            this.store.set(key, value);
        }

        delete(key: string): void {
            this.store.delete(key);
        }
    },
}));

vi.mock('react-native', () => ({
    Platform: platform,
}));

function getStore(id: string): Map<string, string> {
    const existing = mmkvStores.get(id) ?? new Map<string, string>();
    mmkvStores.set(id, existing);
    return existing;
}

async function loadServerConfig() {
    return import('./serverConfig');
}

describe('serverConfig', () => {
    beforeEach(() => {
        vi.resetModules();
        mmkvStores.clear();
        platform.OS = 'ios';
        process.env = { ...originalEnv };
        delete process.env.EXPO_PUBLIC_SERVER_URL;
        delete process.env.EXPO_PUBLIC_ORBIT_SERVER_URL;
        vi.unstubAllGlobals();
        (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    });

    afterEach(() => {
        process.env = originalEnv;
        delete (globalThis as { __DEV__?: boolean }).__DEV__;
    });

    it('ignores and clears persisted legacy server overrides', async () => {
        const legacyStore = getStore('server-config');
        legacyStore.set('custom-server-url', 'http://legacy-server.example:3005');

        const { getServerUrl } = await loadServerConfig();

        expect(getServerUrl()).toBe('https://api.2003383.xyz');
        expect(legacyStore.has('custom-server-url')).toBe(false);
    });

    it('uses orbit runtime server env without touching legacy storage', async () => {
        process.env.EXPO_PUBLIC_ORBIT_SERVER_URL = 'https://api.orbit.example/';

        const { getServerUrl, isUsingCustomServer } = await loadServerConfig();

        expect(getServerUrl()).toBe('https://api.orbit.example');
        expect(isUsingCustomServer()).toBe(true);
        expect(getStore('server-config').has('custom-server-url')).toBe(false);
    });

    it('does not persist manual server overrides anymore', async () => {
        const { getServerUrl, setServerUrl } = await loadServerConfig();

        setServerUrl('https://old-config.example');

        expect(getServerUrl()).toBe('https://api.2003383.xyz');
        expect(getStore('server-config').has('custom-server-url')).toBe(false);
    });

    it('exposes the raw origin as a fallback candidate', async () => {
        const { getServerUrlCandidates } = await loadServerConfig();

        expect(getServerUrlCandidates()).toEqual([
            'https://api.2003383.xyz',
            'http://192.227.228.53:3005',
        ]);
    });

    it('switches to the fallback origin when the primary health check fails', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false })
            .mockResolvedValueOnce({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        const { ensureReachableServerUrl, getServerUrl } = await loadServerConfig();

        await expect(ensureReachableServerUrl()).resolves.toBe('http://192.227.228.53:3005');
        expect(getServerUrl()).toBe('http://192.227.228.53:3005');
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://api.2003383.xyz/health',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://192.227.228.53:3005/health',
            expect.objectContaining({ method: 'GET' }),
        );
    });
});
