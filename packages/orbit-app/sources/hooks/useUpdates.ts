import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { trackOtaUpdateAvailable, trackOtaUpdateApplied } from '@/track';
import {
    checkForExpoUpdateAsync,
    fetchExpoUpdateAsync,
    getExpoUpdatesState,
    reloadFromExpoUpdatesAsync,
} from '@/utils/expoUpdates';

type PendingOtaUpdate = {
    ota_version?: string;
    ota_runtime_version?: string;
};

export function useUpdates() {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [pendingUpdate, setPendingUpdate] = useState<PendingOtaUpdate | null>(null);

    useEffect(() => {
        if (!getExpoUpdatesState().isEnabled) {
            return;
        }

        // Check for updates when app becomes active
        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Initial check
        checkForUpdates();

        return () => {
            subscription.remove();
        };
    }, []);

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
            checkForUpdates();
        }
    };

    const checkForUpdates = async () => {
        if (__DEV__ || !getExpoUpdatesState().isEnabled) {
            // Don't check for updates in development
            return;
        }

        if (isChecking) {
            return;
        }

        setIsChecking(true);

        try {
            const update = await checkForExpoUpdateAsync();
            if (update.isAvailable) {
                const pendingUpdate = {
                    ota_version: update.manifest.id,
                    ota_runtime_version: 'runtimeVersion' in update.manifest ? update.manifest.runtimeVersion : undefined,
                };
                await fetchExpoUpdateAsync();
                trackOtaUpdateAvailable(pendingUpdate);
                setPendingUpdate(pendingUpdate);
                setUpdateAvailable(true);
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
        } finally {
            setIsChecking(false);
        }
    };

    const reloadApp = async () => {
        trackOtaUpdateApplied(pendingUpdate ?? undefined);
        try {
            await reloadFromExpoUpdatesAsync();
        } catch (error) {
            console.error('Error reloading app:', error);
        }
    };

    return {
        updateAvailable,
        isChecking,
        checkForUpdates,
        reloadApp,
    };
}
