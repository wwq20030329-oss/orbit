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
import { sync, syncCreate } from '@/sync/sync';

interface UseConnectTerminalOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

export function useConnectTerminal(options?: UseConnectTerminalOptions) {
    const auth = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);
    const checkScannerPermissions = useCheckScannerPermissions();
    const authPrefix = 'orbit://terminal?';

    const processAuthUrl = React.useCallback(async (url: string) => {
        if (!url.startsWith(authPrefix)) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        if (!auth.credentials?.token || !auth.credentials.secret) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'), [{ text: t('common.ok') }]);
            return false;
        }
        
        setIsLoading(true);
        try {
            const tail = url.slice(authPrefix.length);
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
            await sync.refreshMachines();
            
            Modal.alert(t('common.success'), t('modals.terminalConnectedSuccessfully'), [
                { 
                    text: t('common.ok'), 
                    onPress: () => options?.onSuccess?.()
                }
            ]);
            return true;
        } catch (e) {
            console.error('Failed to connect terminal:', e);
            Modal.alert(t('common.error'), t('modals.failedToConnectTerminal'), [{ text: t('common.ok') }]);
            options?.onError?.(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [auth.credentials, options]);

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
                if (event.data.startsWith(authPrefix)) {
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
    }, [processAuthUrl, authPrefix]);

    return {
        connectTerminal,
        connectWithUrl,
        isLoading,
        processAuthUrl
    };
}
