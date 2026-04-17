import * as React from 'react';
import { Platform } from 'react-native';
import { CameraView } from 'expo-camera';
import { buildTerminalApprovalPayloads } from '@/auth/terminalApproval';
import { authApprove } from '@/auth/authApprove';
import { useAuth } from '@/auth/AuthContext';
import { decodeBase64 } from '@/encryption/base64';
import { useCheckScannerPermissions } from '@/hooks/useCheckCameraPermissions';
import { Modal } from '@/modal';
import { t } from '@/text';
import { storage } from '@/sync/storage';
import { sync, syncCreate } from '@/sync/sync';
import { getTerminalAuthPrefixes } from '@/utils/appUrlScheme';

interface UseConnectTerminalOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

async function refreshMachinesWithRetry(maxAttempts: number = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await sync.refreshMachines();

        const hasActiveMachine = Object.values(storage.getState().machines).some((machine) => machine?.active);
        if (hasActiveMachine) {
            return;
        }

        if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
    }
}

export function useConnectTerminal(options?: UseConnectTerminalOptions) {
    const auth = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);
    const checkScannerPermissions = useCheckScannerPermissions();
    const authPrefixes = getTerminalAuthPrefixes();

    const processAuthUrl = React.useCallback(async (url: string) => {
        const matchingPrefix = authPrefixes.find((prefix) => url.startsWith(prefix));
        if (!matchingPrefix) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        if (!auth.credentials?.token || !auth.credentials.secret) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'), [{ text: t('common.ok') }]);
            return false;
        }
        
        setIsLoading(true);
        try {
            const tail = url.slice(matchingPrefix.length);
            const publicKey = decodeBase64(tail, 'base64url');
            void syncCreate(auth.credentials).catch((error) => {
                console.warn('Sync initialization failed while connecting terminal; continuing with local key derivation.', error);
            });

            const { responseV1, responseV2 } = await buildTerminalApprovalPayloads(
                auth.credentials.secret,
                publicKey,
                sync.encryption?.contentDataKey,
            );
            await authApprove(auth.credentials.token, publicKey, responseV1, responseV2);
            await refreshMachinesWithRetry();
            
            Modal.alert(t('common.success'), t('modals.terminalConnectedSuccessfully'), [
                { 
                    text: t('common.ok'), 
                    onPress: () => options?.onSuccess?.()
                }
            ]);
            return true;
        } catch (e) {
            console.error('Failed to connect terminal:', e);
            const errorMessage = e instanceof Error && e.message
                ? `${t('modals.failedToConnectTerminal')}\n${e.message}`
                : t('modals.failedToConnectTerminal');
            Modal.alert(t('common.error'), errorMessage, [{ text: t('common.ok') }]);
            options?.onError?.(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [auth.credentials, authPrefixes, options]);

    const connectTerminal = React.useCallback(async () => {
        if (await checkScannerPermissions()) {
            // Use camera scanner
            CameraView.launchScanner({
                barcodeTypes: ['qr']
            });
        } else {
            Modal.alert(t('common.error'), t('modals.cameraPermissionsRequiredToConnectTerminal'), [{ text: t('common.ok') }]);
        }
    }, [checkScannerPermissions]);

    const connectWithUrl = React.useCallback(async (url: string) => {
        return await processAuthUrl(url);
    }, [processAuthUrl]);

    // Set up barcode scanner listener
    React.useEffect(() => {
        if (CameraView.isModernBarcodeScannerAvailable) {
            const subscription = CameraView.onModernBarcodeScanned(async (event) => {
                if (authPrefixes.some((prefix) => event.data.startsWith(prefix))) {
                    // Dismiss scanner on Android is called automatically when barcode is scanned
                    if (Platform.OS === 'ios') {
                        await CameraView.dismissScanner();
                    }
                    await processAuthUrl(event.data);
                }
            });
            return () => {
                subscription.remove();
            };
        }
    }, [processAuthUrl, authPrefixes]);

    return {
        connectTerminal,
        connectWithUrl,
        isLoading,
        processAuthUrl
    };
}
