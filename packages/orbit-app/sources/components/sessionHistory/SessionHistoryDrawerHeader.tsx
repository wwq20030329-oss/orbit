import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Typography } from '@/constants/Typography';
import { Text } from '@/components/StyledText';
import { getPhoneCliLabel } from '@/utils/phoneCli';
import { t } from '@/text';
import type { SessionHistoryViewMode } from '@/hooks/useSessionHistoryController';
import type { CliThreadDisplayTool } from '@/utils/cliThreadList';

const stylesheet = StyleSheet.create((theme) => ({
    header: {
        minHeight: 104,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    headerTextWrap: {
        flex: 1,
        minWidth: 0,
        gap: 6,
    },
    eyebrow: {
        fontSize: 11,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        ...Typography.default('semiBold'),
    },
    title: {
        fontSize: 24,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    meta: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    tabsRow: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    tabChip: {
        minHeight: 34,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 7,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabChipActive: {
        backgroundColor: theme.colors.text,
    },
    tabChipText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    tabChipTextActive: {
        color: theme.colors.groupped.background,
    },
    primaryAction: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
}));

export const SessionHistoryDrawerHeader = React.memo((props: {
    currentCli: CliThreadDisplayTool;
    sessionCount: number;
    view: SessionHistoryViewMode;
    onChangeView?: (view: SessionHistoryViewMode) => void;
    onPrimaryActionPress: () => void;
    showViewSwitcher?: boolean;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const showViewSwitcher = props.showViewSwitcher ?? true;

    return (
        <View style={styles.header}>
            <View style={styles.headerTextWrap}>
                <Text style={styles.eyebrow}>{t('sessionHistory.title')}</Text>
                <Text style={styles.title}>{getPhoneCliLabel(props.currentCli)}</Text>
                <Text style={styles.meta}>
                    {props.sessionCount > 0
                        ? t('sessionHistory.sessionsCount', { count: props.sessionCount })
                        : t('sessionHistory.empty')}
                </Text>
                {showViewSwitcher && (
                    <View style={styles.tabsRow}>
                        {(['sessions', 'history'] as const).map((view) => {
                            const active = props.view === view;
                            const label = view === 'sessions'
                                ? t('sessionHistory.sessionsTab')
                                : t('sessionHistory.historyTab');
                            return (
                                <Pressable
                                    key={view}
                                    style={[styles.tabChip, active && styles.tabChipActive]}
                                    onPress={() => props.onChangeView?.(view)}
                                >
                                    <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
            </View>
            <Pressable style={styles.primaryAction} onPress={props.onPrimaryActionPress}>
                <Ionicons name="add-outline" size={20} color={theme.colors.text} />
            </Pressable>
        </View>
    );
});
