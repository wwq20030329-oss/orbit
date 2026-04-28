import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';
import { syncCreate } from '@/sync/sync';
import { clearPersistence, loadRegisteredPushToken } from '@/sync/persistence';
import { unregisterPushToken } from '@/sync/apiPush';
import { Platform } from 'react-native';
import { trackLogout } from '@/track';
import { reloadFromExpoUpdatesAsync } from '@/utils/expoUpdates';

interface AuthContextType {
    isAuthenticated: boolean;
    credentials: AuthCredentials | null;
    login: (token: string, secret: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, initialCredentials }: { children: ReactNode; initialCredentials: AuthCredentials | null }) {
    const [isAuthenticated, setIsAuthenticated] = useState(!!initialCredentials);
    const [credentials, setCredentials] = useState<AuthCredentials | null>(initialCredentials);

    // Update global auth state when local state changes
    useEffect(() => {
        setCurrentAuth(credentials ? { isAuthenticated, credentials, login, logout } : null);
    }, [isAuthenticated, credentials]);

    const login = async (token: string, secret: string) => {
        const newCredentials: AuthCredentials = { token, secret };
        const success = await TokenStorage.setCredentials(newCredentials);
        if (success) {
            setCredentials(newCredentials);
            setIsAuthenticated(true);
            try {
                await syncCreate(newCredentials);
            } catch (error) {
                // Do not block account entry on non-critical bootstrap failures.
                // The app can continue to reconnect and resync in the background.
                console.error('Initial sync failed during login:', error);
            }
        } else {
            throw new Error('Failed to save credentials');
        }
    };

    const logout = async () => {
        trackLogout();
        const registeredPushToken = credentials ? loadRegisteredPushToken() : null;
        if (credentials && registeredPushToken) {
            try {
                await unregisterPushToken(credentials, registeredPushToken);
            } catch (error) {
                console.log('Failed to unregister push token during logout:', error);
            }
        }
        clearPersistence();
        await TokenStorage.removeCredentials();
        
        // Update React state to ensure UI consistency
        setCredentials(null);
        setIsAuthenticated(false);
        
        try {
            await reloadFromExpoUpdatesAsync();
        } catch (error) {
            console.log('Reload failed:', error);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                credentials,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Helper to get current auth state for non-React contexts
let currentAuthState: AuthContextType | null = null;

export function setCurrentAuth(auth: AuthContextType | null) {
    currentAuthState = auth;
}

export function getCurrentAuth(): AuthContextType | null {
    return currentAuthState;
}
