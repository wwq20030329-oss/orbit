import * as React from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';

import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useEntitlement, useLocalSettingMutable } from '@/sync/storage';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useMultiClick } from '@/hooks/useMultiClick';
import { trackPaywallButtonClicked, trackWhatsNewClicked } from '@/track';
import { sync } from '@/sync/sync';

export default React.memo(() => {
    const router = useRouter();
    const { theme } = useUnistyles();
    const appVersion = Constants.expoConfig?.version || '1.0.0';
    const isPro = __DEV__ || useEntitlement('pro');
    const [devModeEnabled, setDevModeEnabled] = useLocalSettingMutable('devModeEnabled');

    const openExternalUrl = React.useCallback(async (url: string) => {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
            await Linking.openURL(url);
        }
    }, []);

    const handleSubscribe = React.useCallback(async () => {
        trackPaywallButtonClicked('voluntary_support');
        const result = await sync.presentPaywall('voluntary_support');
        if (!result.success) {
            console.error('Failed to present paywall:', result.error);
        }
    }, []);

    const handleVersionClick = useMultiClick(() => {
        const newDevMode = !devModeEnabled;
        setDevModeEnabled(newDevMode);
        Modal.alert(
            t('modals.developerMode'),
            newDevMode ? t('modals.developerModeEnabled') : t('modals.developerModeDisabled'),
        );
    }, {
        requiredClicks: 10,
        resetTimeout: 2000,
    });

    return (
        <ItemList>
            <ItemGroup title={t('settings.about')} footer={t('settings.aboutFooter')}>
                <Item
                    title={t('settings.supportUs')}
                    subtitle={isPro ? t('settings.supportUsSubtitlePro') : t('settings.supportUsSubtitle')}
                    icon={<Ionicons name="heart" size={24} color="#FF3B30" />}
                    showChevron={!isPro}
                    onPress={isPro ? undefined : handleSubscribe}
                />
                <Item
                    title={t('settings.whatsNew')}
                    subtitle={t('settings.whatsNewSubtitle')}
                    icon={<Ionicons name="sparkles-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => {
                        trackWhatsNewClicked();
                        router.push('/changelog');
                    }}
                />
                <Item
                    title={t('settings.github')}
                    icon={<Ionicons name="logo-github" size={24} color={theme.colors.textSecondary} />}
                    detail="wwq20030329-oss/orbit"
                    onPress={() => void openExternalUrl('https://github.com/wwq20030329-oss/orbit')}
                />
                <Item
                    title={t('settings.reportIssue')}
                    icon={<Ionicons name="bug-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => void openExternalUrl('https://github.com/wwq20030329-oss/orbit/issues')}
                />
                <Item
                    title={t('settings.privacyPolicy')}
                    icon={<Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => void openExternalUrl('https://github.com/wwq20030329-oss/orbit/blob/main/PRIVACY.md')}
                />
                <Item
                    title={t('settings.termsOfService')}
                    icon={<Ionicons name="document-text-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={() => void openExternalUrl('https://github.com/wwq20030329-oss/orbit/blob/main/packages/orbit-app/TERMS.md')}
                />
                {Platform.OS === 'ios' ? (
                    <Item
                        title={t('settings.eula')}
                        icon={<Ionicons name="document-text-outline" size={24} color={theme.colors.textSecondary} />}
                        onPress={() => void openExternalUrl('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
                    />
                ) : null}
                {(__DEV__ || devModeEnabled) ? (
                    <Item
                        title={t('settings.developerTools')}
                        icon={<Ionicons name="construct-outline" size={24} color={theme.colors.textSecondary} />}
                        onPress={() => router.push('/dev')}
                    />
                ) : null}
                <Item
                    title={t('common.version')}
                    detail={appVersion}
                    icon={<Ionicons name="information-circle-outline" size={24} color={theme.colors.textSecondary} />}
                    onPress={handleVersionClick}
                    showChevron={false}
                />
            </ItemGroup>
        </ItemList>
    );
});
