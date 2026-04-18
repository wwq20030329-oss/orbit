import * as React from 'react';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { SessionsListWrapper } from '@/components/SessionsListWrapper';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { closeNearestDrawer } from '@/utils/closeNearestDrawer';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    header: {
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 10,
        gap: 4,
    },
    title: {
        fontSize: 20,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    content: {
        flex: 1,
        minHeight: 0,
    },
    footer: {
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.groupped.background,
    },
    footerButton: {
        minHeight: 50,
        borderRadius: 14,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    footerButtonText: {
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
}));

export const PhoneDrawerContent = React.memo(() => {
    const styles = stylesheet;
    const pathname = usePathname();
    const navigation = useNavigation();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const data = useVisibleSessionListViewData();
    const lastPathnameRef = React.useRef(pathname);

    const handleOpenSettings = React.useCallback(() => {
        closeNearestDrawer(navigation);
        requestAnimationFrame(() => {
            router.navigate('/settings');
        });
    }, [navigation, router]);

    React.useEffect(() => {
        if (lastPathnameRef.current === pathname) {
            return;
        }

        lastPathnameRef.current = pathname;
        closeNearestDrawer(navigation);
    }, [navigation, pathname]);

    return (
        <View style={[styles.container, { paddingTop: safeArea.top, paddingBottom: safeArea.bottom }]}>
            <View style={styles.header}>
                <Text style={styles.title}>{t('tabs.sessions')}</Text>
                <Text style={styles.subtitle}>{t('status.connected')}</Text>
            </View>
            <View style={styles.content}>
                <SessionsListWrapper data={data} mode="drawer" />
            </View>
            <View style={styles.footer}>
                <Pressable
                    style={styles.footerButton}
                    onPress={() => {
                        router.navigate('/new');
                    }}
                >
                    <Ionicons name="add-outline" size={20} />
                    <Text style={styles.footerButtonText}>{t('newSession.title')}</Text>
                </Pressable>
                <Pressable
                    style={styles.footerButton}
                    onPress={handleOpenSettings}
                >
                    <Ionicons name="settings-outline" size={20} />
                    <Text style={styles.footerButtonText}>{t('tabs.settings')}</Text>
                </Pressable>
            </View>
        </View>
    );
});
