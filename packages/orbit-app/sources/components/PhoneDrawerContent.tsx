import * as React from 'react';
import { InteractionManager, Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useDrawerStatus } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { SessionsList } from '@/components/SessionsList';
import { SessionsListWrapper } from '@/components/SessionsListWrapper';
import { SessionHistoryDrawerHeader } from '@/components/sessionHistory/SessionHistoryDrawerHeader';
import { useSessionHistoryController } from '@/hooks/useSessionHistoryController';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { navigateToPhoneWorkspaceHome } from '@/utils/phoneWorkspaceNavigation';

type PhoneDrawerNavigation = {
    closeDrawer: () => void;
};
type PhoneDrawerContentProps = {
    drawerNavigation?: PhoneDrawerNavigation;
    isVisible?: boolean;
};

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    content: {
        flex: 1,
        minHeight: 0,
    },
    contentPlaceholder: {
        flex: 1,
        minHeight: 0,
        paddingHorizontal: 16,
        paddingTop: 6,
        gap: 10,
    },
    placeholderRow: {
        height: 62,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 4,
        backgroundColor: theme.colors.groupped.background,
        gap: 8,
    },
    footerButton: {
        minHeight: 54,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    footerButtonPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minWidth: 0,
    },
    footerButtonText: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
}));

const PhoneDrawerLoadedContent = React.memo(({ drawerNavigation }: PhoneDrawerContentProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const drawerView = 'sessions';
    const {
        currentCli,
        data,
        listReady,
        sectionsState,
        sessionCount,
    } = useSessionHistoryController({
        enabled: true,
        view: drawerView,
    });

    const handleOpenSettings = React.useCallback(() => {
        drawerNavigation?.closeDrawer();
        InteractionManager.runAfterInteractions(() => {
            router.navigate('/settings' as any);
        });
    }, [drawerNavigation, router]);

    const handleNewSession = React.useCallback(() => {
        drawerNavigation?.closeDrawer();
        InteractionManager.runAfterInteractions(() => {
            navigateToPhoneWorkspaceHome(router);
        });
    }, [drawerNavigation, router]);
    const handleOpenProjectSessions = React.useCallback(() => {
        drawerNavigation?.closeDrawer();
        InteractionManager.runAfterInteractions(() => {
            router.navigate('/project-sessions' as any);
        });
    }, [drawerNavigation, router]);
    const handleDrawerItemPress = React.useCallback(() => {
        drawerNavigation?.closeDrawer();
    }, [drawerNavigation]);
    const projectSessionsLabel = React.useMemo(() => {
        const projectLabel = t('newSession.projectLabel');
        const sessionsLabel = t('sessionHistory.sessionsTab');
        const needsWordSpace = /[A-Za-z0-9]$/.test(projectLabel) && /^[A-Za-z0-9]/.test(sessionsLabel);
        return needsWordSpace ? `${projectLabel} ${sessionsLabel}` : `${projectLabel}${sessionsLabel}`;
    }, []);

    return (
        <>
            <SessionHistoryDrawerHeader
                currentCli={currentCli}
                sessionCount={sessionCount}
                view={drawerView}
                onPrimaryActionPress={handleNewSession}
                showViewSwitcher={false}
            />
            <View style={styles.content}>
                {!listReady ? (
                    <View style={styles.contentPlaceholder}>
                        {Array.from({ length: 6 }).map((_, index) => (
                            <View
                                key={`drawer-placeholder-${index}`}
                                style={[
                                    styles.placeholderRow,
                                    index === 0 && { opacity: 0.96 },
                                    index === 5 && { opacity: 0.72 },
                                ]}
                            />
                        ))}
                    </View>
                ) : data && data.length > 0 ? (
                    <SessionsList
                        data={data}
                        mode="drawer"
                        drawerView={drawerView}
                        onDrawerItemPress={handleDrawerItemPress}
                        precomputedToolSectionsState={sectionsState}
                        preselectedTool={currentCli}
                    />
                ) : (
                    <SessionsListWrapper
                        data={data}
                        mode="drawer"
                        drawerView={drawerView}
                        onDrawerItemPress={handleDrawerItemPress}
                    />
                )}
            </View>
            <View style={styles.footer}>
                <Pressable style={styles.footerButton} onPress={handleOpenProjectSessions}>
                    <View style={styles.footerButtonPrimary}>
                        <Ionicons
                            name="folder-open-outline"
                            size={20}
                            color={theme.colors.text}
                        />
                        <Text style={styles.footerButtonText}>{projectSessionsLabel}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable style={styles.footerButton} onPress={handleOpenSettings}>
                    <View style={styles.footerButtonPrimary}>
                        <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
                        <Text style={styles.footerButtonText}>{t('tabs.settings')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
        </>
    );
});

const PhoneDrawerContentBody = React.memo((props: PhoneDrawerContentProps) => {
    const drawerStatus = useDrawerStatus();

    if (drawerStatus !== 'open') {
        return null;
    }

    return <PhoneDrawerLoadedContent {...props} />;
});

export const PhoneDrawerContent = React.memo(({ drawerNavigation, isVisible = true }: PhoneDrawerContentProps) => {
    const styles = stylesheet;
    const pathname = usePathname();
    const safeArea = useSafeAreaInsets();
    const lastPathnameRef = React.useRef(pathname);

    React.useEffect(() => {
        if (lastPathnameRef.current === pathname) {
            return;
        }

        lastPathnameRef.current = pathname;
        drawerNavigation?.closeDrawer();
    }, [drawerNavigation, pathname]);

    return (
        <View style={[styles.container, { paddingTop: safeArea.top, paddingBottom: safeArea.bottom }]}>
            {isVisible ? <PhoneDrawerContentBody drawerNavigation={drawerNavigation} /> : null}
        </View>
    );
});
