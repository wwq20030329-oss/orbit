import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Text } from '@/components/StyledText';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { useEntitlement, useSetting } from '@/sync/storage';
import { Modal } from '@/modal';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { layout } from '@/components/layout';
import { useProfile } from '@/sync/storage';
import { getAvatarUrl, getBio, getDisplayName } from '@/sync/profile';
import { Avatar } from '@/components/Avatar';
import { t } from '@/text';
import { getTerminalAuthPlaceholder } from '@/utils/appUrlScheme';
import { BrandGlyph } from '@/components/BrandLogo';

const stylesheet = StyleSheet.create((theme) => ({
    summaryWrap: {
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    },
    summaryCard: {
        marginTop: 12,
        marginHorizontal: 16,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    summaryBody: {
        flex: 1,
        minWidth: 0,
    },
    summaryTitle: {
        fontSize: 17,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    summarySubtitle: {
        marginTop: 3,
        fontSize: 13,
        lineHeight: 17,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    summaryMeta: {
        marginTop: 8,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
}));

export const SettingsView = React.memo(function SettingsView() {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const isPro = __DEV__ || useEntitlement('pro');
    const experiments = useSetting('experiments');
    const allMachines = useAllMachines();
    const profile = useProfile();
    const displayName = getDisplayName(profile);
    const avatarUrl = getAvatarUrl(profile);
    const bio = getBio(profile);
    const onlineMachineCount = React.useMemo(
        () => allMachines.filter((machine) => isMachineOnline(machine)).length,
        [allMachines],
    );
    const summaryMeta = React.useMemo(() => {
        const parts = [`v${appVersion}`];
        if (onlineMachineCount > 0) {
            parts.push(`${onlineMachineCount} ${t('status.online')}`);
        }
        if (isPro) {
            parts.push('Pro');
        }
        return parts.join(' · ');
    }, [appVersion, isPro, onlineMachineCount]);

    const { connectTerminal, connectWithUrl, isLoading } = useConnectTerminal();

    const handleManualUrl = React.useCallback(async () => {
        const url = await Modal.prompt(
            t('modals.authenticateTerminal'),
            t('modals.pasteUrlFromTerminal'),
            {
                placeholder: getTerminalAuthPlaceholder(),
                confirmText: t('common.authenticate'),
                inputType: 'url',
            },
        );
        if (url?.trim()) {
            connectWithUrl(url.trim());
        }
    }, [connectWithUrl]);

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <View style={styles.summaryWrap}>
                <Pressable
                    style={({ pressed }) => [
                        styles.summaryCard,
                        pressed && { opacity: 0.82 },
                    ]}
                    onPress={() => router.push('/settings/account')}
                >
                    {profile.firstName ? (
                        <Avatar
                            id={profile.id}
                            size={52}
                            imageUrl={avatarUrl}
                            thumbhash={profile.avatar?.thumbhash}
                        />
                    ) : (
                        <BrandGlyph size={44} />
                    )}
                    <View style={styles.summaryBody}>
                        <Text numberOfLines={1} style={styles.summaryTitle}>
                            {profile.firstName ? displayName : 'Orbit'}
                        </Text>
                        <Text numberOfLines={2} style={styles.summarySubtitle}>
                            {profile.firstName ? (bio || t('settings.accountSubtitle')) : 'Remote control for Claude Code'}
                        </Text>
                        <Text numberOfLines={1} style={styles.summaryMeta}>
                            {summaryMeta}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Pressable>
            </View>

            <ItemGroup title={t('settings.quickAccess')}>
                <Item
                    title={t('settings.account')}
                    icon={<Ionicons name="person-circle-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => router.push('/settings/account')}
                />
                <Item
                    title={t('settings.appearance')}
                    icon={<Ionicons name="color-palette-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => router.push('/settings/appearance')}
                />
                <Item
                    title={t('settings.voiceAssistant')}
                    icon={<Ionicons name="mic-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => router.push('/settings/voice')}
                />
                <Item
                    title={t('settings.featuresTitle')}
                    icon={<Ionicons name="flask-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => router.push('/settings/features')}
                />
                {experiments ? (
                    <Item
                        title={t('settings.usage')}
                        icon={<Ionicons name="analytics-outline" size={24} color={theme.colors.textSecondary} />}
                        onPress={() => router.push('/settings/usage')}
                    />
                ) : null}
            </ItemGroup>

            <ItemGroup title={t('settings.connections')}>
                <Item
                    title={t('settings.scanQrCodeToAuthenticate')}
                    icon={<Ionicons name="qr-code-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={connectTerminal}
                    loading={isLoading}
                    showChevron={false}
                />
                <Item
                    title={t('connect.enterUrlManually')}
                    icon={<Ionicons name="link-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => void handleManualUrl()}
                    showChevron={false}
                />
            </ItemGroup>

            <ItemGroup>
                {allMachines.length > 0 ? (
                    <Item
                        title={t('settings.manageDevices')}
                        subtitle={t('settings.deviceSummary', { total: allMachines.length, online: onlineMachineCount })}
                        icon={<Ionicons name="desktop-outline" size={24} color={theme.colors.textSecondary} />}
                        onPress={() => router.push('/settings/machines')}
                    />
                ) : null}
                <Item
                    title={t('settings.aboutOrbit')}
                    subtitle={`v${appVersion}`}
                    icon={<Ionicons name="information-circle-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => router.push('/settings/about')}
                />
            </ItemGroup>
        </ItemList>
    );
});
