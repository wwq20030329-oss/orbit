import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = 'auth_credentials';
const AUTH_FALLBACK_KEY = 'auth_credentials_fallback';

// Cache credentials so repeated hot-path reads do not hit native storage.
let credentialsCache: string | null = null;

export interface AuthCredentials {
    token: string;
    secret: string;
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
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
