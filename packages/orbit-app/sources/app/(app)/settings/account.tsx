import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { Typography } from '@/constants/Typography';
import { formatSecretKeyForBackup } from '@/auth/secretKeyBackup';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { t } from '@/text';
import { layout } from '@/components/layout';
import { useSettingMutable, useProfile } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { Switch } from '@/components/Switch';
import { useConnectAccount } from '@/hooks/useConnectAccount';
import { getDisplayName } from '@/sync/profile';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import { disconnectService } from '@/sync/apiServices';
import { fetchPushTokens, type PushToken } from '@/sync/apiPush';
import {
    getCurrentExpoPushToken,
    getCurrentPushDeviceMetadata,
    getPushPermissionInfo,
    type PushPermissionInfo,
    requestPushPermissionOrOpenSettings,
    removePushToken,
    syncCurrentPushToken,
} from '@/sync/pushRegistration';
import { getPushRegistrationFailureReason } from '@/sync/pushRegistrationErrors';
import { deleteUserAccount } from '@/sync/apiAccount';

function formatPushPermissionLabel(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return t('common.loading');
    }
    if (permission.status === 'unsupported') {
        return t('settingsAccount.pushPermissionUnavailable');
    }
    if (permission.granted) {
        return t('settingsAccount.pushPermissionAllowed');
    }
    if (permission.status === 'denied') {
        return t('settingsAccount.pushPermissionDenied');
    }
    return t('settingsAccount.pushPermissionNotRequested');
}

function formatPushPermissionSubtitle(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return t('settingsAccount.pushPermissionChecking');
    }
    if (permission.status === 'unsupported') {
        return t('settingsAccount.pushPermissionUnsupportedDescription');
    }
    if (permission.granted) {
        return t('settingsAccount.pushPermissionGrantedDescription');
    }
    if (permission.canAskAgain) {
        return t('settingsAccount.pushPermissionCanAskAgainDescription');
    }
    return t('settingsAccount.pushPermissionOpenSettingsDescription');
}

function formatPushTokenFingerprint(token: string): string {
    const rawValue = token.replace(/^ExponentPushToken\[/, '').replace(/\]$/, '');
    if (rawValue.length <= 12) {
        return rawValue;
    }
    return `${rawValue.slice(0, 6)}…${rawValue.slice(-6)}`;
}

function formatPushTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
}

function buildPushTokenSubtitle(pushToken: PushToken, options: {
    isCurrentDevice: boolean;
    currentDeviceLabel: string;
    currentAppLabel: string | null;
}): string {
    const lines: string[] = [];

    if (options.isCurrentDevice) {
        lines.push(options.currentDeviceLabel);
        if (options.currentAppLabel) {
            lines.push(options.currentAppLabel);
        }
    } else {
        lines.push(t('settingsAccount.pushTokenOtherDevice'));
    }

    lines.push(t('settingsAccount.pushTokenRegisteredAt', { time: formatPushTimestamp(pushToken.createdAt) }));
    lines.push(t('settingsAccount.pushTokenLastSeen', { time: formatPushTimestamp(pushToken.updatedAt) }));
    lines.push(t('settingsAccount.pushTokenServerId', { id: pushToken.id }));
    lines.push(t('settingsAccount.pushTokenFingerprint', { token: formatPushTokenFingerprint(pushToken.token) }));
    return lines.join('\n');
}

function getPushRegistrationErrorMessage(error: unknown): string {
    switch (getPushRegistrationFailureReason(error)) {
        case 'missingPushCapability':
            return t('settingsAccount.pushCapabilityMissingBody');
        case 'missingProjectId':
            return t('settingsAccount.pushProjectIdMissingBody');
        default:
            return t('settingsAccount.pushPermissionRequestFailed');
    }
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const [showSecret, setShowSecret] = useState(false);
    const [copiedRecently, setCopiedRecently] = useState(false);
    const [analyticsOptOut, setAnalyticsOptOut] = useSettingMutable('analyticsOptOut');
    const { connectAccount, isLoading: isConnecting } = useConnectAccount();
    const profile = useProfile();
    const currentPushDevice = useMemo(() => getCurrentPushDeviceMetadata(), []);
    const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
    const [pushPermission, setPushPermission] = useState<PushPermissionInfo | null>(null);
    const [currentPushToken, setCurrentPushToken] = useState<string | null>(null);
    const [loadingPushSettings, setLoadingPushSettings] = useState(false);
    const [requestingPushPermission, setRequestingPushPermission] = useState(false);
    const [refreshingPushToken, setRefreshingPushToken] = useState(false);
    const [deletingPushToken, setDeletingPushToken] = useState<string | null>(null);

    // Get the current secret key
    const currentSecret = auth.credentials?.secret || '';
    const formattedSecret = currentSecret ? formatSecretKeyForBackup(currentSecret) : '';

    // Profile display values
    const displayName = getDisplayName(profile);
    const loadPushSettings = useCallback(async (showError = false) => {
        if (!auth.credentials) {
            setPushTokens([]);
            setPushPermission(null);
            setCurrentPushToken(null);
            return;
        }

        setLoadingPushSettings(true);
        try {
            const [tokens, permission, liveToken] = await Promise.all([
                fetchPushTokens(auth.credentials),
                getPushPermissionInfo(),
                getCurrentExpoPushToken(),
            ]);
            setPushTokens(tokens);
            setPushPermission(permission);
            setCurrentPushToken(liveToken);
        } catch (error) {
            console.error('Failed to load push notification settings:', error);
            if (showError) {
                Modal.alert(t('common.error'), t('settingsAccount.pushSettingsLoadFailed'));
            }
        } finally {
            setLoadingPushSettings(false);
        }
    }, [auth.credentials]);

    useEffect(() => {
        void loadPushSettings();
    }, [loadPushSettings]);

    useFocusEffect(
        useCallback(() => {
            void loadPushSettings();
        }, [loadPushSettings])
    );

    // Service disconnection
    const [disconnectingService, setDisconnectingService] = useState<string | null>(null);
    const handleDisconnectService = async (service: string, displayName: string) => {
        const confirmed = await Modal.confirm(
            t('modals.disconnectService', { service: displayName }),
            t('modals.disconnectServiceConfirm', { service: displayName }),
            { confirmText: t('modals.disconnect'), destructive: true }
        );
        if (confirmed) {
            setDisconnectingService(service);
            try {
                await disconnectService(auth.credentials!, service);
                await sync.refreshProfile();
                // The profile will be updated via sync
            } catch (error) {
                Modal.alert(t('common.error'), t('errors.disconnectServiceFailed', { service: displayName }));
            } finally {
                setDisconnectingService(null);
            }
        }
    };

    const handleShowSecret = () => {
        setShowSecret(!showSecret);
    };

    const handleCopySecret = async () => {
        try {
            await Clipboard.setStringAsync(formattedSecret);
            setCopiedRecently(true);
            setTimeout(() => setCopiedRecently(false), 2000);
            Modal.alert(t('common.success'), t('settingsAccount.secretKeyCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyCopyFailed'));
        }
    };

    const handleLogout = async () => {
        const confirmed = await Modal.confirm(
            t('common.logout'),
            t('settingsAccount.logoutConfirm'),
            { confirmText: t('common.logout'), destructive: true }
        );
        if (confirmed) {
            auth.logout();
        }
    };

    // Account deletion
    const [deleting, handleDeleteAccount] = useOrbitAction(async () => {
        if (!auth.credentials) return;

        const confirmed = await Modal.confirm(
            t('settingsAccount.deleteAccount'),
            t('settingsAccount.deleteAccountConfirm'),
            { confirmText: t('common.delete'), destructive: true }
        );

        if (confirmed) {
            await deleteUserAccount(auth.credentials);
            auth.logout();
        }
    });

    const handlePushPermissionRequest = useCallback(async () => {
        if (!auth.credentials) {
            return;
        }

        setRequestingPushPermission(true);
        try {
            const result = await requestPushPermissionOrOpenSettings();
            setPushPermission(result.permission);

            if (result.granted) {
                await syncCurrentPushToken(auth.credentials);
                await loadPushSettings();
                Modal.alert(t('common.success'), t('settingsAccount.pushPermissionEnabledSuccess'));
                return;
            }

            await loadPushSettings();

            if (result.openedSettings) {
                Modal.alert(t('common.openSettings'), t('settingsAccount.pushPermissionOpenedSettingsBody'));
                return;
            }

            Modal.alert(t('common.error'), t('settingsAccount.pushPermissionNotGranted'));
        } catch (error) {
            console.error('Failed to request push permission:', error);
            Modal.alert(t('common.error'), getPushRegistrationErrorMessage(error));
        } finally {
            setRequestingPushPermission(false);
        }
    }, [auth.credentials, loadPushSettings]);

    const handleRefreshCurrentPushToken = useCallback(async () => {
        if (!auth.credentials) {
            return;
        }

        setRefreshingPushToken(true);
        try {
            const result = await syncCurrentPushToken(auth.credentials);
            setPushPermission(result.permission);
            await loadPushSettings();

            if (!result.permission.granted) {
                Modal.alert(t('common.error'), t('settingsAccount.pushRefreshDisabled'));
                return;
            }

            Modal.alert(t('common.success'), t('settingsAccount.pushRefreshSuccess'));
        } catch (error) {
            console.error('Failed to refresh push token:', error);
            Modal.alert(t('common.error'), getPushRegistrationErrorMessage(error));
        } finally {
            setRefreshingPushToken(false);
        }
    }, [auth.credentials, loadPushSettings]);

    const handleDeletePushToken = useCallback(async (pushToken: PushToken) => {
        if (!auth.credentials) {
            return;
        }

        const confirmed = await Modal.confirm(
            t('settingsAccount.pushDeleteTokenTitle'),
            t('settingsAccount.pushDeleteTokenConfirm', { token: formatPushTokenFingerprint(pushToken.token) }),
            { confirmText: t('common.delete'), destructive: true }
        );

        if (!confirmed) {
            return;
        }

        setDeletingPushToken(pushToken.token);
        try {
            await removePushToken(auth.credentials, pushToken.token);
            await loadPushSettings();
        } catch (error) {
            console.error('Failed to delete push token:', error);
            Modal.alert(t('common.error'), t('settingsAccount.pushDeleteTokenFailed'));
        } finally {
            setDeletingPushToken(null);
        }
    }, [auth.credentials, loadPushSettings]);

    return (
        <>
            <ItemList>
                {/* Account Info */}
                <ItemGroup title={t('settingsAccount.accountInformation')}>
                    <Item
                        title={t('settingsAccount.status')}
                        detail={auth.isAuthenticated ? t('settingsAccount.statusActive') : t('settingsAccount.statusNotAuthenticated')}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.anonymousId')}
                        detail={sync.anonID || t('settingsAccount.notAvailable')}
                        showChevron={false}
                        copy={!!sync.anonID}
                    />
                    <Item
                        title={t('settingsAccount.publicId')}
                        detail={sync.serverID || t('settingsAccount.notAvailable')}
                        showChevron={false}
                        copy={!!sync.serverID}
                    />
                    {(
                        <Item
                            title={t('settingsAccount.linkNewDevice')}
                            subtitle={isConnecting ? t('common.scanning') : t('settingsAccount.linkNewDeviceSubtitle')}
                            icon={<Ionicons name="qr-code-outline" size={29} color="#007AFF" />}
                            onPress={connectAccount}
                            disabled={isConnecting}
                            showChevron={false}
                        />
                    )}
                </ItemGroup>

                {/* Profile Section */}
                {(displayName || profile.avatar) && (
                    <ItemGroup title={t('settingsAccount.profile')}>
                        {displayName && (
                            <Item
                                title={t('settingsAccount.name')}
                                detail={displayName}
                                showChevron={false}
                            />
                        )}
                    </ItemGroup>
                )}

                {/* Connected Services Section */}
                {profile.connectedServices && profile.connectedServices.length > 0 && (() => {
                    // Map of service IDs to display names and icons
                    const knownServices = {
                        gemini: { name: 'Google Gemini', tintColor: null },
                        openai: { name: 'OpenAI Codex', tintColor: theme.colors.text }
                    };
                    
                    // Filter to only known services
                    const displayServices = profile.connectedServices.filter(
                        service => service in knownServices
                    );
                    
                    if (displayServices.length === 0) return null;
                    
                    return (
                        <ItemGroup title={t('settings.connectedAccounts')}>
                            {displayServices.map(service => {
                                const serviceInfo = knownServices[service as keyof typeof knownServices];
                                const isDisconnecting = disconnectingService === service;
                                return (
                                    <Item
                                        key={service}
                                        title={serviceInfo.name}
                                        detail={t('settingsAccount.statusActive')}
                                        subtitle={t('settingsAccount.tapToDisconnect')}
                                        onPress={() => handleDisconnectService(service, serviceInfo.name)}
                                        loading={isDisconnecting}
                                        disabled={isDisconnecting}
                                        showChevron={false}
                                        icon={
                                            <Ionicons
                                                name={service === 'gemini' ? 'sparkles-outline' : 'code-slash-outline'}
                                                size={29}
                                                color={serviceInfo.tintColor ?? theme.colors.textSecondary}
                                            />
                                        }
                                    />
                                );
                            })}
                        </ItemGroup>
                    );
                })()}

                {/* Backup Section */}
                <ItemGroup
                    title={t('settingsAccount.backup')}
                    footer={t('settingsAccount.backupDescription')}
                >
                    <Item
                        title={t('settingsAccount.secretKey')}
                        subtitle={showSecret ? t('settingsAccount.tapToHide') : t('settingsAccount.tapToReveal')}
                        icon={<Ionicons name={showSecret ? "eye-off-outline" : "eye-outline"} size={29} color="#FF9500" />}
                        onPress={handleShowSecret}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Secret Key Display */}
                {showSecret && (
                    <ItemGroup>
                        <Pressable onPress={handleCopySecret}>
                            <View style={{
                                backgroundColor: theme.colors.surface,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                width: '100%',
                                maxWidth: layout.maxWidth,
                                alignSelf: 'center'
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={{
                                        fontSize: 11,
                                        color: theme.colors.textSecondary,
                                        letterSpacing: 0.5,
                                        textTransform: 'uppercase',
                                        ...Typography.default('semiBold')
                                    }}>
                                        {t('settingsAccount.secretKeyLabel')}
                                    </Text>
                                    <Ionicons
                                        name={copiedRecently ? "checkmark-circle" : "copy-outline"}
                                        size={18}
                                        color={copiedRecently ? "#34C759" : theme.colors.textSecondary}
                                    />
                                </View>
                                <Text style={{
                                    fontSize: 13,
                                    letterSpacing: 0.5,
                                    lineHeight: 20,
                                    color: theme.colors.text,
                                    ...Typography.mono()
                                }}>
                                    {formattedSecret}
                                </Text>
                            </View>
                        </Pressable>
                    </ItemGroup>
                )}

                {/* Analytics Section */}
                <ItemGroup
                    title={t('settingsAccount.privacy')}
                    footer={t('settingsAccount.privacyDescription')}
                >
                    <Item
                        title={t('settingsAccount.analytics')}
                        subtitle={analyticsOptOut ? t('settingsAccount.analyticsDisabled') : t('settingsAccount.analyticsEnabled')}
                        rightElement={
                            <Switch
                                value={!analyticsOptOut}
                                onValueChange={(value) => {
                                    const optOut = !value;
                                    setAnalyticsOptOut(optOut);
                                }}
                                trackColor={{ false: '#767577', true: '#34C759' }}
                                thumbColor="#FFFFFF"
                            />
                        }
                        showChevron={false}
                    />
                </ItemGroup>

                <ItemGroup
                    title={t('settingsAccount.pushNotifications')}
                    footer={t('settingsAccount.pushNotificationsFooter')}
                >
                    <Item
                        title={t('settingsAccount.pushPermissionTitle')}
                        detail={formatPushPermissionLabel(pushPermission)}
                        subtitle={formatPushPermissionSubtitle(pushPermission)}
                        icon={<Ionicons name="notifications-outline" size={29} color="#007AFF" />}
                        loading={loadingPushSettings}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.pushRequestPermissionAgain')}
                        subtitle={pushPermission?.status === 'unsupported'
                            ? t('settingsAccount.pushRequestPermissionUnsupportedSubtitle')
                            : pushPermission?.canAskAgain
                            ? t('settingsAccount.pushRequestPermissionCanAskAgainSubtitle')
                            : t('settingsAccount.pushRequestPermissionOpenSettingsSubtitle')}
                        icon={<Ionicons name="shield-checkmark-outline" size={29} color="#34C759" />}
                        onPress={handlePushPermissionRequest}
                        loading={requestingPushPermission}
                        disabled={requestingPushPermission || loadingPushSettings || pushPermission?.status === 'unsupported' || !auth.credentials}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.pushReregisterDevice')}
                        subtitle={currentPushToken
                            ? t('settingsAccount.pushCurrentTokenSubtitle', { token: formatPushTokenFingerprint(currentPushToken) })
                            : t('settingsAccount.pushReregisterSubtitle')}
                        icon={<Ionicons name="refresh-outline" size={29} color="#FF9500" />}
                        onPress={handleRefreshCurrentPushToken}
                        loading={refreshingPushToken}
                        disabled={refreshingPushToken || loadingPushSettings || !auth.credentials}
                        showChevron={false}
                    />
                </ItemGroup>

                <ItemGroup
                    title={t('settingsAccount.pushRegisteredTokens', { count: pushTokens.length })}
                    footer={t('settingsAccount.pushRegisteredTokensFooter')}
                >
                    {pushTokens.length === 0 ? (
                        <Item
                            title={t('settingsAccount.pushNoRegisteredTokens')}
                            subtitle={t('settingsAccount.pushNoRegisteredTokensSubtitle')}
                            showChevron={false}
                        />
                    ) : (
                        <>
                            {pushTokens.map((pushToken) => {
                                const isCurrentDevice = currentPushToken === pushToken.token;
                                return (
                                    <Item
                                        key={pushToken.id}
                                        title={formatPushTokenFingerprint(pushToken.token)}
                                        detail={isCurrentDevice ? t('settingsAccount.pushThisDevice') : undefined}
                                        subtitle={buildPushTokenSubtitle(pushToken, {
                                            isCurrentDevice,
                                            currentDeviceLabel: currentPushDevice.deviceLabel,
                                            currentAppLabel: currentPushDevice.appLabel,
                                        })}
                                        subtitleLines={0}
                                        icon={(
                                            <Ionicons
                                                name={isCurrentDevice ? 'phone-portrait-outline' : 'trash-outline'}
                                                size={29}
                                                color={isCurrentDevice ? theme.colors.textSecondary : '#FF3B30'}
                                            />
                                        )}
                                        onPress={isCurrentDevice ? undefined : () => handleDeletePushToken(pushToken)}
                                        loading={deletingPushToken === pushToken.token}
                                        disabled={deletingPushToken !== null}
                                        showChevron={false}
                                        copy={isCurrentDevice ? pushToken.token : false}
                                    />
                                );
                            })}
                        </>
                    )}
                </ItemGroup>

                {/* Danger Zone */}
                <ItemGroup title={t('settingsAccount.dangerZone')}>
                    <Item
                        title={t('settingsAccount.logout')}
                        subtitle={t('settingsAccount.logoutSubtitle')}
                        icon={<Ionicons name="log-out-outline" size={29} color="#FF3B30" />}
                        destructive
                        onPress={handleLogout}
                    />
                    <Item
                        title={t('settingsAccount.deleteAccount')}
                        subtitle={t('settingsAccount.deleteAccountSubtitle')}
                        icon={<Ionicons name="trash-outline" size={29} color="#FF3B30" />}
                        destructive
                        onPress={handleDeleteAccount}
                    />
                </ItemGroup>
            </ItemList>
        </>
    );
});
