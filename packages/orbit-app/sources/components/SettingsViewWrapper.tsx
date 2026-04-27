import * as React from 'react';
import { View, Pressable, useWindowDimensions, Animated, Easing, InteractionManager } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SettingsView } from './SettingsView';
import { Text } from '@/components/StyledText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { layout } from './layout';
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
        backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    floatingCard: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
        flexShrink: 1,
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
    floatingCardPhone: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 12,
    },
    floatingHeader: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.groupped.background,
    },
    floatingHandleWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 10,
        paddingBottom: 2,
        backgroundColor: theme.colors.groupped.background,
    },
    floatingHandle: {
        width: 42,
        height: 5,
        borderRadius: 999,
        backgroundColor: theme.colors.divider,
    },
    floatingTitle: {
        fontSize: 17,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    floatingCloseButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    floatingContent: {
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
    },
    skeletonRoot: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
        gap: 14,
    },
    skeletonSummaryCard: {
        minHeight: 118,
        borderRadius: 20,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    skeletonAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: theme.colors.surfaceHigh,
    },
    skeletonSummaryBody: {
        flex: 1,
        minWidth: 0,
        gap: 10,
    },
    skeletonLine: {
        height: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceHigh,
    },
    skeletonGroup: {
        gap: 10,
        paddingHorizontal: 2,
    },
    skeletonRow: {
        minHeight: 58,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    skeletonRowIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHigh,
    },
    skeletonRowText: {
        flex: 1,
        gap: 8,
        minWidth: 0,
    },
    skeletonRowChevron: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surfaceHigh,
    },
}));

interface SettingsViewWrapperProps {
    variant?: 'embedded' | 'floating';
}

interface SettingsFloatingFrameProps {
    children: React.ReactNode;
    deferContent?: boolean;
    title?: string;
}

let hasWarmedFloatingSettingsContent = false;

export function buildFloatingSettingsSkeletonPlan(isLargeLayout: boolean) {
    return {
        summaryLines: isLargeLayout ? 3 : 2,
        quickAccessRows: isLargeLayout ? 4 : 3,
        connectionRows: 3,
    } as const;
}

export function shouldDeferFloatingSettingsContent() {
    return !hasWarmedFloatingSettingsContent;
}

export function buildFloatingSettingsPanelMetrics(args: {
    width: number;
    height: number;
    insets: {
        top: number;
        bottom: number;
    };
    isLargeLayout: boolean;
}) {
    const horizontalMargin = args.isLargeLayout ? 24 : 12;
    const verticalMargin = args.isLargeLayout ? 24 : 12;
    const availableWidth = Math.max(0, args.width - horizontalMargin * 2);
    const availableHeight = Math.max(0, args.height - args.insets.top - args.insets.bottom - verticalMargin * 2);
    const desiredHeight = args.isLargeLayout
        ? Math.min(820, availableHeight)
        : Math.min(availableHeight, Math.max(560, Math.round(args.height * 0.9)));

    return {
        width: Math.min(availableWidth, layout.maxWidth),
        height: desiredHeight,
        marginTop: args.insets.top + verticalMargin,
        marginBottom: args.insets.bottom + verticalMargin,
        borderRadius: 28,
    } as const;
}

function FloatingSettingsSkeleton({ isLargeLayout }: { isLargeLayout: boolean }) {
    const styles = stylesheet;
    const plan = buildFloatingSettingsSkeletonPlan(isLargeLayout);
    return (
        <View style={styles.skeletonRoot}>
            <View style={styles.skeletonSummaryCard}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonSummaryBody}>
                    {Array.from({ length: plan.summaryLines }).map((_, index) => (
                        <View
                            key={`summary-${index}`}
                            style={[
                                styles.skeletonLine,
                                {
                                    width: index === 0
                                        ? '58%'
                                        : index === plan.summaryLines - 1
                                            ? '44%'
                                            : '82%',
                                    height: index === 0 ? 14 : 10,
                                },
                            ]}
                        />
                    ))}
                </View>
            </View>
            <View style={styles.skeletonGroup}>
                {Array.from({ length: plan.quickAccessRows }).map((_, index) => (
                    <View key={`quick-${index}`} style={styles.skeletonRow}>
                        <View style={styles.skeletonRowIcon} />
                        <View style={styles.skeletonRowText}>
                            <View style={[styles.skeletonLine, { width: index % 2 === 0 ? '54%' : '64%' }]} />
                            <View style={[styles.skeletonLine, { width: '34%', height: 10 }]} />
                        </View>
                        <View style={styles.skeletonRowChevron} />
                    </View>
                ))}
            </View>
            <View style={styles.skeletonGroup}>
                {Array.from({ length: plan.connectionRows }).map((_, index) => (
                    <View key={`connection-${index}`} style={styles.skeletonRow}>
                        <View style={styles.skeletonRowIcon} />
                        <View style={styles.skeletonRowText}>
                            <View style={[styles.skeletonLine, { width: index === 0 ? '48%' : '58%' }]} />
                            <View style={[styles.skeletonLine, { width: '42%', height: 10 }]} />
                        </View>
                        <View style={styles.skeletonRowChevron} />
                    </View>
                ))}
            </View>
        </View>
    );
}

export const SettingsFloatingFrame = React.memo((props: SettingsFloatingFrameProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigation = useNavigation();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isLargeLayout = width >= 768;
    const openProgress = React.useRef(new Animated.Value(0)).current;
    const openInteractionRef = React.useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const mountedRef = React.useRef(true);
    const closingRef = React.useRef(false);
    const [floatingContentReady, setFloatingContentReady] = React.useState(
        !props.deferContent || !shouldDeferFloatingSettingsContent(),
    );
    const backdropOpacity = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
        }),
        [openProgress],
    );
    const cardTranslateY = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [24, 0],
        }),
        [openProgress],
    );

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    React.useEffect(() => {
        const shouldDeferContent = Boolean(props.deferContent && shouldDeferFloatingSettingsContent());
        openInteractionRef.current?.cancel();
        openInteractionRef.current = null;
        setFloatingContentReady(!shouldDeferContent);
        openProgress.stopAnimation();
        openProgress.setValue(0);
        if (shouldDeferContent) {
            openInteractionRef.current = InteractionManager.runAfterInteractions(() => {
                openInteractionRef.current = null;
                hasWarmedFloatingSettingsContent = true;
                React.startTransition(() => {
                    setFloatingContentReady(true);
                });
            });
        }
        Animated.timing(openProgress, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();

        return () => {
            openInteractionRef.current?.cancel();
            openInteractionRef.current = null;
        };
    }, [openProgress, props.deferContent]);

    const finalizeClose = React.useCallback(() => {
        if (navigation.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/');
    }, [navigation, router]);

    const handleClose = React.useCallback(() => {
        if (closingRef.current) {
            return;
        }

        closingRef.current = true;
        openInteractionRef.current?.cancel();
        openInteractionRef.current = null;
        openProgress.stopAnimation();
        Animated.timing(openProgress, {
            toValue: 0,
            duration: 140,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!mountedRef.current) {
                return;
            }

            if (finished) {
                finalizeClose();
                return;
            }

            closingRef.current = false;
        });
    }, [finalizeClose, openProgress]);

    const metrics = buildFloatingSettingsPanelMetrics({
        width,
        height,
        insets,
        isLargeLayout,
    });
    const cardStyle = (
        isLargeLayout
            ? [
                styles.floatingCard,
                styles.floatingCardLarge,
                {
                    width: metrics.width,
                    height: metrics.height,
                    marginTop: metrics.marginTop,
                    marginBottom: metrics.marginBottom,
                    marginHorizontal: 24,
                    borderRadius: metrics.borderRadius,
                },
            ]
            : [
                styles.floatingCard,
                styles.floatingCardPhone,
                {
                    width: metrics.width,
                    height: metrics.height,
                    marginTop: metrics.marginTop,
                    marginBottom: metrics.marginBottom,
                    borderRadius: metrics.borderRadius,
                },
            ]
    );

    return (
        <View style={styles.floatingRoot}>
            <Animated.View
                pointerEvents="none"
                style={[styles.floatingBackdrop, { opacity: backdropOpacity }]}
            />
            <Pressable style={styles.floatingBackdrop} onPress={handleClose} />
            <Animated.View
                style={[
                    cardStyle,
                    {
                        transform: [
                            { translateY: cardTranslateY },
                        ],
                    },
                ]}
            >
                <View style={styles.floatingHandleWrap}>
                    <View style={styles.floatingHandle} />
                </View>
                <View style={styles.floatingHeader}>
                    <View style={styles.floatingCloseButton} />
                    <Text style={styles.floatingTitle}>
                        {props.title ?? t('settings.title')}
                    </Text>
                    <Pressable style={styles.floatingCloseButton} onPress={handleClose}>
                        <Ionicons name="close" size={22} color={theme.colors.text} />
                    </Pressable>
                </View>
                <View style={styles.floatingContent}>
                    <View style={{ flex: 1 }}>
                        {floatingContentReady ? props.children : <FloatingSettingsSkeleton isLargeLayout={isLargeLayout} />}
                    </View>
                </View>
            </Animated.View>
        </View>
    );
});

export const SettingsViewWrapper = React.memo(({ variant = 'embedded' }: SettingsViewWrapperProps) => {
    const styles = stylesheet;

    if (variant === 'floating') {
        return (
            <SettingsFloatingFrame deferContent>
                <SettingsView />
            </SettingsFloatingFrame>
        );
    }

    return (
        <View style={styles.container}>
            <SettingsView />
        </View>
    );
});
