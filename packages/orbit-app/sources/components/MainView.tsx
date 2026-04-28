import * as React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useHasOnlineMachines, useRealtimeStatus, useSocketConnectionStatus } from '@/sync/storage';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useIsTablet } from '@/utils/responsive';
import { EmptySessionsTablet } from './EmptySessionsTablet';
import { SessionsList } from './SessionsList';
import { SessionsListWrapper } from './SessionsListWrapper';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';

interface MainViewProps {
    variant: 'phone' | 'sidebar';
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    phoneContainer: {
        flex: 1,
    },
    sidebarContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
    loadingContainerWrapper: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 32,
    },
    tabletLoadingContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        flexDirection: 'column',
        backgroundColor: theme.colors.groupped.background,
    },
    emptyStateContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
}));

export const MainView = React.memo(({ variant }: MainViewProps) => {
    const isTablet = useIsTablet();
    if (variant === 'sidebar') {
        return <SidebarSessionsContent />;
    }

    if (isTablet) {
        return <View style={styles.emptyStateContentContainer} />;
    }

    return (
        <View style={styles.phoneContainer}>
            <PhoneVoiceAssistantStatusBar />
            <PhoneSessionsContent />
        </View>
    );
});

const PhoneSessionsContent = React.memo(() => {
    const sessionListViewData = useVisibleSessionListViewData();
    return <SessionsListWrapper data={sessionListViewData} />;
});

const PhoneVoiceAssistantStatusBar = React.memo(() => {
    const realtimeStatus = useRealtimeStatus();

    if (realtimeStatus === 'disconnected') {
        return null;
    }

    return (
        <VoiceAssistantStatusBar
            variant="full"
            realtimeStatusOverride={realtimeStatus}
        />
    );
});

const SidebarSessionsContent = React.memo(() => {
    const { theme } = useUnistyles();
    const sessionListViewData = useVisibleSessionListViewData();

    if (sessionListViewData === null) {
        return (
            <View style={styles.sidebarContentContainer}>
                <View style={styles.tabletLoadingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
            </View>
        );
    }

    if (sessionListViewData.length === 0) {
        return (
            <View style={styles.sidebarContentContainer}>
                <View style={styles.emptyStateContainer}>
                    <EmptySessionsTablet />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.sidebarContentContainer}>
            <SessionsList data={sessionListViewData} />
        </View>
    );
});
