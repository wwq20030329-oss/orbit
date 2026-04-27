import * as React from 'react';
import { Animated, Easing, Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionsList } from '@/components/SessionsList';
import { SessionsListWrapper } from '@/components/SessionsListWrapper';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { useSessionHistoryController } from '@/hooks/useSessionHistoryController';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { layout } from '@/components/layout';

const stylesheet = StyleSheet.create((theme) => ({
    floatingRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    floatingBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.24)',
    },
    floatingPanel: {
        alignSelf: 'center',
        backgroundColor: theme.colors.groupped.background,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 12,
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
    },
}));

function useProjectSessionsTitle(): string {
    return React.useMemo(() => {
        const projectLabel = t('newSession.projectLabel');
        const sessionsLabel = t('sessionHistory.sessionsTab');
        const needsWordSpace = /[A-Za-z0-9]$/.test(projectLabel) && /^[A-Za-z0-9]/.test(sessionsLabel);
        return needsWordSpace ? `${projectLabel} ${sessionsLabel}` : `${projectLabel}${sessionsLabel}`;
    }, []);
}

export function buildProjectSessionsPanelMetrics(args: {
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

export default function ProjectSessionsScreen() {
    const title = useProjectSessionsTitle();
    const router = useRouter();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { theme } = useUnistyles();
    const { width, height } = useWindowDimensions();
    const isLargeLayout = width >= 768;
    const openProgress = React.useRef(new Animated.Value(0)).current;
    const {
        currentCli,
        data,
        listReady,
        sectionsState,
    } = useSessionHistoryController({
        enabled: true,
        view: 'history',
    });

    React.useEffect(() => {
        void sync.refreshMachines().catch((error) => {
            console.warn('Failed to refresh machines before loading project sessions:', error);
        });
    }, []);

    React.useEffect(() => {
        openProgress.stopAnimation();
        openProgress.setValue(0);
        Animated.timing(openProgress, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [openProgress]);

    const finalizeClose = React.useCallback(() => {
        if (navigation.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/');
    }, [navigation, router]);

    const handleClose = React.useCallback(() => {
        openProgress.stopAnimation();
        Animated.timing(openProgress, {
            toValue: 0,
            duration: 140,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) {
                finalizeClose();
            }
        });
    }, [finalizeClose, openProgress]);

    const panelMetrics = buildProjectSessionsPanelMetrics({
        width,
        height,
        insets,
        isLargeLayout,
    });
    const panelTranslateY = openProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [24, 0],
    });
    const panelOpacity = openProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.94, 1],
    });
    const backdropOpacity = openProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    return (
        <View style={stylesheet.floatingRoot}>
            <Animated.View
                pointerEvents="none"
                style={[stylesheet.floatingBackdrop, { opacity: backdropOpacity }]}
            />
            <Pressable style={stylesheet.floatingBackdrop} onPress={handleClose} />
            <Animated.View
                style={[
                    stylesheet.floatingPanel,
                    {
                        width: panelMetrics.width,
                        height: panelMetrics.height,
                        marginTop: panelMetrics.marginTop,
                        marginBottom: panelMetrics.marginBottom,
                        borderRadius: panelMetrics.borderRadius,
                        opacity: panelOpacity,
                        transform: [{ translateY: panelTranslateY }],
                    },
                ]}
            >
                <View style={stylesheet.floatingHandleWrap}>
                    <View style={stylesheet.floatingHandle} />
                </View>
                <View style={stylesheet.floatingHeader}>
                    <View style={stylesheet.floatingCloseButton} />
                    <Text style={stylesheet.floatingTitle}>
                        {title}
                    </Text>
                    <Pressable style={stylesheet.floatingCloseButton} onPress={handleClose}>
                        <Ionicons name="close" size={22} color={theme.colors.text} />
                    </Pressable>
                </View>
                <View style={stylesheet.floatingContent}>
                    {!listReady ? (
                        <SessionsListWrapper data={null} mode="default" drawerView="history" />
                    ) : data && data.length > 0 ? (
                        <SessionsList
                            data={data}
                            mode="default"
                            drawerView="history"
                            precomputedToolSectionsState={sectionsState}
                            preselectedTool={currentCli}
                        />
                    ) : (
                        <SessionsListWrapper data={data} mode="default" drawerView="history" />
                    )}
                </View>
            </Animated.View>
        </View>
    );
}
