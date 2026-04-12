import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const AUTH_KEY = 'auth_credentials';
const AUTH_FALLBACK_KEY = 'auth_credentials_fallback';

// Cache for synchronous access
let credentialsCache: string | null = null;

export interface AuthCredentials {
    token: string;
    secret: string;
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        if (Platform.OS === 'web') {
            return localStorage.getItem(AUTH_KEY) ? JSON.parse(localStorage.getItem(AUTH_KEY)!) as AuthCredentials : null;
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
        if (Platform.OS === 'web') {
            localStorage.setItem(AUTH_KEY, JSON.stringify(credentials));
            return true;
        }

        try {
            const json = JSON.stringify(credentials);
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
            localStorage.removeItem(AUTH_KEY);
            return true;
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
