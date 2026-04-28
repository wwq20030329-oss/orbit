import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';

import { getCurrentLanguage } from '@/text';
import type { ExecutionChecklist, ExecutionChecklistItem, ExecutionChecklistItemStatus } from '@/utils/sessionExecutionChecklist';

const COLLAPSED_ITEM_COUNT = 4;
const INLINE_COLLAPSED_ITEM_COUNT = 1;

export const ExecutionChecklistCard = React.memo((props: {
    checklist: ExecutionChecklist;
    variant?: 'card' | 'inline';
}) => {
    const { checklist } = props;
    const variant = props.variant ?? 'card';
    const isInline = variant === 'inline';
    const [expanded, setExpanded] = React.useState(false);
    const copy = React.useMemo(() => getCopy(), []);
    const collapsedItemCount = isInline ? INLINE_COLLAPSED_ITEM_COUNT : COLLAPSED_ITEM_COUNT;
    const orderedItems = React.useMemo(
        () => (isInline && !expanded ? prioritizeChecklistItems(checklist.items) : checklist.items),
        [checklist.items, expanded, isInline],
    );
    const hiddenCount = Math.max(0, checklist.items.length - collapsedItemCount);
    const visibleItems = expanded || hiddenCount === 0
        ? checklist.items
        : orderedItems.slice(0, collapsedItemCount);
    const progressPercent = checklist.totalCount > 0
        ? Math.round((checklist.completedCount / checklist.totalCount) * 100)
        : 0;
    const titleText = checklist.hasActiveItem ? copy.workingTitle : copy.progressTitle;
    const statusText = checklist.completedCount === checklist.totalCount
        ? copy.completed
        : checklist.hasActiveItem
            ? copy.inProgress
            : copy.pending;

    return (
        <View style={[styles.card, isInline && styles.cardInline]}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.toggle}
                onPress={() => hiddenCount > 0 && setExpanded((value) => !value)}
                style={[styles.header, isInline && styles.headerInline]}
            >
                <View style={[styles.headerIcon, isInline && styles.headerIconInline]}>
                    <Ionicons name="sparkles-outline" size={isInline ? 13 : 15} color="#111111" />
                </View>
                <View style={styles.headerText}>
                    <Text style={[styles.title, isInline && styles.titleInline]} numberOfLines={1}>{titleText}</Text>
                    <Text style={[styles.subtitle, isInline && styles.subtitleInline]} numberOfLines={1}>
                        {statusText} · {checklist.completedCount}/{checklist.totalCount}
                    </Text>
                </View>
                {hiddenCount > 0 && (
                    <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#8E8E93"
                    />
                )}
            </Pressable>

            <View style={[styles.progressTrack, isInline && styles.progressTrackInline]}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>

            <View style={[styles.items, isInline && styles.itemsInline]}>
                {visibleItems.map((item) => (
                    <ExecutionChecklistRow key={item.id} item={item} inline={isInline} />
                ))}
                {!expanded && hiddenCount > 0 && (
                    <Text style={[styles.moreText, isInline && styles.moreTextInline]}>{copy.more(hiddenCount)}</Text>
                )}
            </View>
        </View>
    );
});

function prioritizeChecklistItems(items: ExecutionChecklistItem[]): ExecutionChecklistItem[] {
    const activeItem = items.find((item) => item.status === 'running' || item.status === 'error');
    if (!activeItem) {
        return items;
    }

    return [
        activeItem,
        ...items.filter((item) => item.id !== activeItem.id),
    ];
}

function ExecutionChecklistRow(props: {
    item: ExecutionChecklistItem;
    inline?: boolean;
}) {
    const { item } = props;
    return (
        <View style={[styles.itemRow, props.inline && styles.itemRowInline]}>
            <StatusMark status={item.status} inline={props.inline} />
            <Text
                numberOfLines={props.inline ? 1 : 2}
                style={[
                    styles.itemText,
                    props.inline && styles.itemTextInline,
                    item.status === 'completed' && styles.itemTextCompleted,
                    item.status === 'pending' && styles.itemTextPending,
                    item.status === 'error' && styles.itemTextError,
                ]}
            >
                {item.title}
            </Text>
        </View>
    );
}

function StatusMark(props: {
    status: ExecutionChecklistItemStatus;
    inline?: boolean;
}) {
    const dotStyle = props.inline ? styles.statusDotInline : null;

    switch (props.status) {
        case 'completed':
            return (
                <View style={[styles.statusDot, dotStyle, styles.statusDotCompleted]}>
                    <Ionicons name="checkmark" size={props.inline ? 10 : 11} color="#FFFFFF" />
                </View>
            );
        case 'running':
            return (
                <View style={[styles.statusDot, dotStyle, styles.statusDotRunning]}>
                    <ActivityIndicator size="small" color="#007AFF" />
                </View>
            );
        case 'error':
            return (
                <View style={[styles.statusDot, dotStyle, styles.statusDotError]}>
                    <Ionicons name="alert" size={props.inline ? 10 : 11} color="#FFFFFF" />
                </View>
            );
        case 'pending':
        default:
            return <View style={[styles.statusDot, dotStyle, styles.statusDotPending]} />;
    }
}

function getCopy() {
    const language = getCurrentLanguage();
    const isChinese = language.startsWith('zh');

    return {
        workingTitle: isChinese ? '思考中' : 'Working',
        progressTitle: isChinese ? '执行进度' : 'Progress',
        completed: isChinese ? '已完成' : 'Completed',
        inProgress: isChinese ? '正在推进' : 'In progress',
        pending: isChinese ? '待处理' : 'Pending',
        toggle: isChinese ? '展开或收起执行进度' : 'Expand or collapse execution progress',
        more: (count: number) => isChinese ? `还有 ${count} 项` : `${count} more`,
    };
}

const styles = StyleSheet.create((theme) => ({
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    cardInline: {
        marginHorizontal: 22,
        marginBottom: 8,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.78)',
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.045)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerInline: {
        gap: 8,
    },
    headerIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? '#FFFFFF' : '#F2F2F7',
    },
    headerIconInline: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.92)' : '#F7F7FA',
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: theme.colors.text,
        fontSize: 14,
        fontWeight: '700',
    },
    titleInline: {
        fontSize: 13,
    },
    subtitle: {
        marginTop: 2,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
    },
    subtitleInline: {
        marginTop: 1,
        fontSize: 11,
    },
    progressTrack: {
        height: 4,
        borderRadius: 999,
        marginTop: 10,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
        overflow: 'hidden',
    },
    progressTrackInline: {
        height: 3,
        marginTop: 8,
    },
    progressFill: {
        height: '100%',
        minWidth: 4,
        borderRadius: 999,
        backgroundColor: '#30D158',
    },
    items: {
        gap: 8,
        marginTop: 10,
    },
    itemsInline: {
        gap: 6,
        marginTop: 8,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
    },
    itemRowInline: {
        alignItems: 'center',
        gap: 8,
    },
    statusDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        marginTop: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusDotInline: {
        width: 16,
        height: 16,
        borderRadius: 8,
        marginTop: 0,
    },
    statusDotCompleted: {
        backgroundColor: '#30D158',
    },
    statusDotRunning: {
        backgroundColor: 'rgba(0, 122, 255, 0.12)',
    },
    statusDotPending: {
        borderWidth: 1.5,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(0, 0, 0, 0.22)',
        backgroundColor: 'transparent',
    },
    statusDotError: {
        backgroundColor: '#FF453A',
    },
    itemText: {
        flex: 1,
        color: theme.colors.text,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    itemTextInline: {
        fontSize: 12,
        lineHeight: 16,
    },
    itemTextCompleted: {
        color: theme.colors.textSecondary,
        textDecorationLine: 'line-through',
    },
    itemTextPending: {
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    itemTextError: {
        color: '#FF453A',
    },
    moreText: {
        paddingLeft: 27,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontWeight: '600',
    },
    moreTextInline: {
        paddingLeft: 24,
        fontSize: 11,
    },
}));
