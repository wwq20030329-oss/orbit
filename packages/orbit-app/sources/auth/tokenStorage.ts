import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { WebSecureStore } from './webSecureStore';
import { ensureWebCredentialsMigrated } from './tokenStorageWebMigrate';

const AUTH_KEY = 'auth_credentials';
const AUTH_FALLBACK_KEY = 'auth_credentials_fallback';

// Cache for synchronous access on native. Web reads hit IndexedDB and
// the WebCrypto decrypt path; we cache the plaintext JSON on both sides
// so the hot path after first read stays in-memory.
let credentialsCache: string | null = null;

async function readWebPlaintext(): Promise<string | null> {
    await ensureWebCredentialsMigrated();

    if (WebSecureStore.isSupported()) {
        const stored = await WebSecureStore.getPlaintext();
        if (stored) return stored;
    }

    // Fallback for browsers without IndexedDB/WebCrypto (older Safari,
    // some privacy modes). We still read legacy `localStorage` values
    // so users are not forcibly logged out, but new writes always go
    // through the encrypted store when it's available.
    if (typeof localStorage !== 'undefined') {
        const legacy = localStorage.getItem(AUTH_KEY) ?? localStorage.getItem(AUTH_FALLBACK_KEY);
        if (legacy) return legacy;
    }
    return null;
}

async function writeWebPlaintext(plaintext: string): Promise<void> {
    if (WebSecureStore.isSupported()) {
        await WebSecureStore.setPlaintext(plaintext);
        // Defensive: make sure no stale legacy entry hangs around after
        // we have successfully persisted an encrypted copy.
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(AUTH_FALLBACK_KEY);
        }
        return;
    }

    // Only reached on browsers without WebCrypto/IndexedDB. Writing to
    // `localStorage` here is knowingly insecure; it exists purely so the
    // app degrades to a functional (if less protected) state rather than
    // refusing login entirely.
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_FALLBACK_KEY, plaintext);
        console.warn('[tokenStorage] WebCrypto/IndexedDB unavailable; credentials stored in plain localStorage.');
        return;
    }

    throw new Error('No credential storage available in this environment');
}

async function clearWebPlaintext(): Promise<void> {
    if (WebSecureStore.isSupported()) {
        await WebSecureStore.clear();
    }
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(AUTH_FALLBACK_KEY);
    }
}

export interface AuthCredentials {
    token: string;
    secret: string;
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        if (Platform.OS === 'web') {
            if (credentialsCache) {
                return JSON.parse(credentialsCache) as AuthCredentials;
            }
            const stored = await readWebPlaintext();
            if (!stored) return null;
            credentialsCache = stored;
            return JSON.parse(stored) as AuthCredentials;
        }

        if (credentialsCache) {
            return JSON.parse(credentialsCache) as AuthCredentials;
        }

        try {
            const stored = await SecureStore.getItemAsync(AUTH_KEY);
            if (stored) {
                credentialsCache = stored;
                return JSON.parse(stored) as AuthCredentials;
            }
        } catch (error) {
            console.warn('SecureStore unavailable, falling back to AsyncStorage for credentials:', error);
        }

        try {
            const fallbackStored = await AsyncStorage.getItem(AUTH_FALLBACK_KEY);
            if (!fallbackStored) {
                return null;
            }
            credentialsCache = fallbackStored;
            return JSON.parse(fallbackStored) as AuthCredentials;
        } catch (error) {
            console.error('Error getting fallback credentials:', error);
            return null;
        }
    },

    async setCredentials(credentials: AuthCredentials): Promise<boolean> {
        const json = JSON.stringify(credentials);

        if (Platform.OS === 'web') {
            try {
                await writeWebPlaintext(json);
                credentialsCache = json;
                return true;
            } catch (error) {
                console.error('Error setting web credentials:', error);
                return false;
            }
        }

        try {
            try {
                await SecureStore.setItemAsync(AUTH_KEY, json);
                credentialsCache = json;
                await AsyncStorage.removeItem(AUTH_FALLBACK_KEY);
                return true;
            } catch (error) {
                console.warn('SecureStore unavailable, storing credentials in AsyncStorage fallback:', error);
            }

            await AsyncStorage.setItem(AUTH_FALLBACK_KEY, json);
            credentialsCache = json;
            return true;
        } catch (error) {
            console.error('Error setting credentials:', error);
            return false;
        }
    },

    async removeCredentials(): Promise<boolean> {
        if (Platform.OS === 'web') {
            try {
                await clearWebPlaintext();
                credentialsCache = null;
                return true;
            } catch (error) {
                console.error('Error removing web credentials:', error);
                return false;
            }
        }
        try {
            try {
                await SecureStore.deleteItemAsync(AUTH_KEY);
            } catch (error) {
                console.warn('SecureStore unavailable while removing credentials:', error);
            }
            await AsyncStorage.removeItem(AUTH_FALLBACK_KEY);
            credentialsCache = null;
            return true;
        } catch (error) {
            console.error('Error removing credentials:', error);
            return false;
        }
    },
};
