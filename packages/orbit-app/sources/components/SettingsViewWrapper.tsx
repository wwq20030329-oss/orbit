import * as React from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SettingsView } from './SettingsView';
import { Text } from '@/components/StyledText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
import { closeNearestDrawer } from '@/utils/closeNearestDrawer';
import { t } from '@/text';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    floatingRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    floatingBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.32)',
    },
    floatingCard: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
        backgroundColor: theme.colors.groupped.background,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    floatingCardLarge: {
        borderRadius: 28,
    },
    floatingHeader: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    floatingTitle: {
        fontSize: 17,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    floatingCloseButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    floatingContent: {
        flex: 1,
        minHeight: 0,
    },
}));

interface SettingsViewWrapperProps {
    variant?: 'embedded' | 'floating';
}

export const SettingsViewWrapper = React.memo(({ variant = 'embedded' }: SettingsViewWrapperProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigation = useNavigation();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isLargeLayout = width >= 768;

    React.useEffect(() => {
        closeNearestDrawer(navigation);
    }, [navigation]);

    const handleClose = React.useCallback(() => {
        closeNearestDrawer(navigation);
        if (navigation.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/');
    }, [navigation, router]);

    if (variant === 'floating') {
        const cardStyle = isLargeLayout
            ? [
                styles.floatingCard,
                styles.floatingCardLarge,
                {
                    maxHeight: Math.min(height - (insets.top + insets.bottom + 48), 820),
                    marginTop: insets.top + 24,
                    marginBottom: insets.bottom + 24,
                    marginHorizontal: 24,
                },
            ]
            : [
                styles.floatingCard,
                {
                    maxHeight: height - insets.top - 12,
                    marginTop: insets.top + 12,
                },
            ];

        return (
            <View style={styles.floatingRoot}>
                <Pressable style={styles.floatingBackdrop} onPress={handleClose} />
                <View style={cardStyle}>
                    <View style={styles.floatingHeader}>
                        <View style={styles.floatingCloseButton} />
                        <Text style={styles.floatingTitle}>
                            {t('settings.title')}
                        </Text>
                        <Pressable style={styles.floatingCloseButton} onPress={handleClose}>
                            <Ionicons name="close" size={22} color={theme.colors.text} />
                        </Pressable>
                    </View>
                    <View style={styles.floatingContent}>
                        <SettingsView />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SettingsView />
        </View>
    );
});
