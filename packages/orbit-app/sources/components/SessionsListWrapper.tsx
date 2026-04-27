import * as React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { VisibleSessionListViewItem } from '@/hooks/useVisibleSessionListViewData';
import { SessionsList } from './SessionsList';
import { EmptyMainScreen } from './EmptyMainScreen';
import { Text } from './StyledText';
import { t } from '@/text';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
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
    drawerEmptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    drawerEmptyStateText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
}));

interface SessionsListWrapperProps {
    data: VisibleSessionListViewItem[] | null;
    mode?: 'default' | 'drawer';
    drawerView?: 'sessions' | 'history';
    onDrawerItemPress?: () => void;
}

export const SessionsListWrapper = React.memo(({ data: sessionListViewData, mode = 'default', drawerView = 'history', onDrawerItemPress }: SessionsListWrapperProps) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const machines = useAllMachines({ includeOffline: true });
    const hasRegisteredMachines = machines.length > 0;
    const hasOnlineMachines = React.useMemo(
        () => machines.some((machine) => isMachineOnline(machine)),
        [machines],
    );
    const drawerEmptyMessage = drawerView === 'history' && hasRegisteredMachines && !hasOnlineMachines
        ? t('newSession.machineOffline')
        : t('sessionHistory.empty');

    if (sessionListViewData === null) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainerWrapper}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                </View>
            </View>
        );
    }

    if (sessionListViewData.length === 0) {
        if (mode === 'drawer') {
            return (
                <View style={styles.container}>
                    <View style={styles.loadingContainerWrapper}>
                        <View style={styles.drawerEmptyState}>
                            <Text style={styles.drawerEmptyStateText}>{drawerEmptyMessage}</Text>
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.container}>
                <View style={styles.emptyStateContainer}>
                    <View style={styles.emptyStateContentContainer}>
                        <EmptyMainScreen />
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SessionsList data={sessionListViewData} mode={mode} drawerView={drawerView} onDrawerItemPress={onDrawerItemPress} />
        </View>
    );
});
