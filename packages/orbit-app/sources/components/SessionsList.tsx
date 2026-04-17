import React from 'react';
import { View, Pressable, FlatList, ActivityIndicator, ActionSheetIOS, Platform, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Text } from '@/components/StyledText';
import { SessionListViewItem, useLocalSettingMutable } from '@/sync/storage';
import type { NativeCliTool } from '@/sync/storageTypes';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { StyleSheet } from 'react-native-unistyles';
import { requestReview } from '@/utils/requestReview';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { useNavigateDirectlyToSession, useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import { getCliSectionTitle } from '@/utils/nativeCliHistory';
import { deleteCliProjectGroup, deleteCliThreadItem } from '@/utils/cliThreadDelete';
import {
    buildCliThreadToolSections,
    CLI_THREAD_TOOL_ORDER,
    formatCliThreadUpdatedAt,
    getCliThreadScopedProjects,
    pickPreferredCliThreadTool,
    type CliThreadScope,
    type CliThreadProjectGroup,
    type CliThreadToolSection,
    type CliThreadListItem,
} from '@/utils/cliThreadList';
import { openCliThreadItem } from '@/utils/openCliThreadItem';
import { Modal } from '@/modal';
import { t } from '@/text';

const DEFAULT_VISIBLE_PROJECTS = 6;

function showDeleteActionSheet(
    title: string,
    destructiveLabel: string,
    onSelectDelete: () => void,
): void {
    if (Platform.OS !== 'ios') {
        onSelectDelete();
        return;
    }

    ActionSheetIOS.showActionSheetWithOptions(
        {
            title,
            options: [t('common.cancel'), destructiveLabel],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 1,
            userInterfaceStyle: 'light',
        },
        (buttonIndex) => {
            if (buttonIndex === 1) {
                onSelectDelete();
            }
        },
    );
}

function getCliSectionSummary(section: CliThreadToolSection): string {
    if (section.projectCount === 0) {
        return `No ${section.title} work yet`;
    }

    return section.projectCount === 1 ? '1 project' : `${section.projectCount} projects`;
}

function getCliSectionScopedSummary(
    section: CliThreadToolSection,
    scope: CliThreadScope,
): string {
    if (section.projectCount === 0) {
        return `No ${section.title} work yet`;
    }

    if (scope === 'current-project') {
        return 'Current project';
    }

    return getCliSectionSummary(section);
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
    headerBlock: {
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 10,
        gap: 14,
    },
    pager: {
        flex: 1,
    },
    pageContainer: {
        flex: 1,
    },
    pageContent: {
        flexGrow: 1,
        paddingBottom: 128,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 2,
    },
    summaryTitle: {
        fontSize: 14,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        ...Typography.default('semiBold'),
    },
    summaryMeta: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    summaryButton: {
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    summaryButtonText: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    pageDots: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    scopeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    scopeChip: {
        minHeight: 36,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scopeChipActive: {
        backgroundColor: theme.colors.text,
    },
    scopeChipText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    scopeChipTextActive: {
        color: theme.colors.groupped.background,
    },
    pageDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceHigh,
    },
    pageDotActive: {
        width: 22,
        backgroundColor: theme.colors.text,
    },
    projectCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    projectHeaderRow: {
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 18,
        paddingVertical: 16,
    },
    projectContent: {
        flex: 1,
        minWidth: 0,
    },
    projectTitle: {
        fontSize: 18,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectChevron: {
        color: theme.colors.textSecondary,
    },
    expandedThreads: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.surfaceHigh,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 12,
        gap: 8,
    },
    threadRow: {
        minHeight: 52,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: theme.colors.groupped.background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    threadRowContent: {
        flex: 1,
        minWidth: 0,
    },
    threadRowTitle: {
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default(),
    },
    threadRowMeta: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    openingBadge: {
        marginTop: 6,
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
        backgroundColor: theme.colors.groupped.background,
    },
    openingBadgeText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    emptyState: {
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    emptyStateTitle: {
        fontSize: 17,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    emptyStateSubtitle: {
        marginTop: 6,
        fontSize: 15,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    openingSpinner: {
        color: theme.colors.textSecondary,
    },
}));

interface SessionsListProps {
    data: SessionListViewItem[];
}

export function SessionsList({ data }: SessionsListProps) {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const windowWidth = useWindowDimensions().width;
    const [preferredCliToolTab, setPreferredCliToolTab] = useLocalSettingMutable('preferredCliToolTab');
    const [cliThreadScopeByTool, setCliThreadScopeByTool] = useLocalSettingMutable('cliThreadScopeByTool');
    const [expandedTools, setExpandedTools] = React.useState<Record<NativeCliTool, boolean>>({
        claude: false,
        codex: false,
        gemini: false,
    });
    const [expandedProjects, setExpandedProjects] = React.useState<Record<string, boolean>>({});
    const pagerRef = React.useRef<FlatList<CliThreadToolSection>>(null);
    const lastSyncedToolRef = React.useRef<NativeCliTool | null>(null);
    const [pageWidth, setPageWidth] = React.useState(windowWidth);

    const threadSourceItems = React.useMemo(
        () => data.filter((item): item is Extract<SessionListViewItem, { type: 'session' | 'native-cli-session' }> =>
            item.type === 'session' || item.type === 'native-cli-session',
        ),
        [data],
    );
    const sections = React.useMemo(() => buildCliThreadToolSections(threadSourceItems), [threadSourceItems]);
    const selectedTool = React.useMemo(
        () => pickPreferredCliThreadTool(sections, preferredCliToolTab),
        [preferredCliToolTab, sections],
    );
    const selectedToolIndex = React.useMemo(
        () => Math.max(0, sections.findIndex((section) => section.tool === selectedTool)),
        [sections, selectedTool],
    );

    React.useEffect(() => {
        if (data.length > 0) {
            requestReview();
        }
    }, [data.length]);

    React.useEffect(() => {
        lastSyncedToolRef.current = null;
    }, [pageWidth]);

    React.useEffect(() => {
        if (!sections[selectedToolIndex] || pageWidth <= 0) {
            return;
        }

        if (lastSyncedToolRef.current === selectedTool) {
            return;
        }

        pagerRef.current?.scrollToIndex({
            index: selectedToolIndex,
            animated: false,
        });
        lastSyncedToolRef.current = selectedTool;
    }, [pageWidth, sections, selectedTool, selectedToolIndex]);

    const handlePagerMomentumEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (pageWidth <= 0) {
            return;
        }

        const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
        const nextTool = sections[nextIndex]?.tool;
        if (!nextTool || nextTool === selectedTool) {
            lastSyncedToolRef.current = selectedTool;
            return;
        }

        lastSyncedToolRef.current = nextTool;
        setPreferredCliToolTab(nextTool);
    }, [pageWidth, sections, selectedTool, setPreferredCliToolTab]);

    const setToolScope = React.useCallback((tool: NativeCliTool, scope: CliThreadScope) => {
        setCliThreadScopeByTool({
            ...cliThreadScopeByTool,
            [tool]: scope,
        });
    }, [cliThreadScopeByTool, setCliThreadScopeByTool]);

    const renderListHeader = React.useCallback((section: CliThreadToolSection) => {
        const scope = cliThreadScopeByTool[section.tool] ?? 'current-project';
        const scopedProjects = getCliThreadScopedProjects(section, scope);
        const isExpanded = expandedTools[section.tool];
        const canExpand = scope === 'all-projects' && scopedProjects.projects.length > DEFAULT_VISIBLE_PROJECTS;

        return (
            <View style={styles.headerBlock}>
                <View style={styles.summaryRow}>
                    <View>
                        <Text style={styles.summaryTitle}>
                            {section.title}
                        </Text>
                        <Text style={styles.summaryMeta}>
                            {getCliSectionScopedSummary(section, scope)}
                        </Text>
                    </View>
                    <View style={styles.pageDots}>
                        {CLI_THREAD_TOOL_ORDER.map((tool) => (
                            <View
                                key={tool}
                                style={[
                                    styles.pageDot,
                                    tool === section.tool && styles.pageDotActive,
                                ]}
                            />
                        ))}
                    </View>
                </View>
                {section.projectCount > 0 && (
                    <View style={styles.scopeRow}>
                        {(['current-project', 'all-projects'] as const).map((option) => {
                            const active = scope === option;
                            const label = option === 'current-project' ? 'Current project' : 'All projects';
                            return (
                                <Pressable
                                    key={option}
                                    style={[
                                        styles.scopeChip,
                                        active && styles.scopeChipActive,
                                    ]}
                                    onPress={() => {
                                        setToolScope(section.tool, option);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.scopeChipText,
                                            active && styles.scopeChipTextActive,
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
                {canExpand && (
                    <Pressable
                        style={styles.summaryButton}
                        onPress={() => {
                            setExpandedTools((current) => ({
                                ...current,
                                [section.tool]: !isExpanded,
                            }));
                        }}
                    >
                        <Text style={styles.summaryButtonText}>
                            {isExpanded ? 'Show less' : 'Show more'}
                        </Text>
                    </Pressable>
                )}
            </View>
        );
    }, [
        expandedTools,
        cliThreadScopeByTool,
        setToolScope,
        styles.headerBlock,
        styles.pageDot,
        styles.pageDotActive,
        styles.pageDots,
        styles.scopeChip,
        styles.scopeChipActive,
        styles.scopeChipText,
        styles.scopeChipTextActive,
        styles.scopeRow,
        styles.summaryButton,
        styles.summaryButtonText,
        styles.summaryMeta,
        styles.summaryRow,
        styles.summaryTitle,
        setExpandedTools,
    ]);

    return (
        <View style={styles.container}>
            <View
                style={styles.contentContainer}
                onLayout={(event) => {
                    const nextWidth = Math.round(event.nativeEvent.layout.width);
                    if (nextWidth > 0 && nextWidth !== pageWidth) {
                        setPageWidth(nextWidth);
                    }
                }}
            >
                <UpdateBanner />
                <FlatList
                    ref={pagerRef}
                    style={styles.pager}
                    data={sections}
                    horizontal
                    pagingEnabled
                    directionalLockEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.tool}
                    initialScrollIndex={selectedToolIndex}
                    getItemLayout={(_, index) => ({
                        length: pageWidth,
                        offset: pageWidth * index,
                        index,
                    })}
                    onMomentumScrollEnd={handlePagerMomentumEnd}
                    renderItem={({ item: section }) => {
                        const scope = cliThreadScopeByTool[section.tool] ?? 'current-project';
                        const scopedProjects = getCliThreadScopedProjects(section, scope);
                        const isExpanded = expandedTools[section.tool];
                        const visibleProjects = isExpanded
                            ? scopedProjects.projects
                            : scopedProjects.projects.slice(0, DEFAULT_VISIBLE_PROJECTS);

                        return (
                            <View style={[styles.pageContainer, { width: pageWidth }]}>
                                <FlatList
                                    data={visibleProjects}
                                    renderItem={({ item }) => (
                                        <CliProjectCard
                                            project={item}
                                            expanded={expandedProjects[item.id] === true}
                                            onToggleExpanded={() => {
                                                setExpandedProjects((current) => ({
                                                    ...current,
                                                    [item.id]: !(current[item.id] === true),
                                                }));
                                            }}
                                        />
                                    )}
                                    keyExtractor={(item) => item.id}
                                    ListHeaderComponent={renderListHeader(section)}
                                    ListEmptyComponent={<EmptyToolState tool={section.tool} />}
                                    contentContainerStyle={[styles.pageContent, { paddingBottom: safeArea.bottom + 128 }]}
                                    windowSize={5}
                                    maxToRenderPerBatch={8}
                                    initialNumToRender={12}
                                />
                            </View>
                        );
                    }}
                />
            </View>
        </View>
    );
}

const EmptyToolState = React.memo(({ tool }: { tool: NativeCliTool }) => {
    const styles = stylesheet;

    return (
        <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>
                No {getCliSectionTitle(tool)} work yet
            </Text>
            <Text style={styles.emptyStateSubtitle}>
                Start a {getCliSectionTitle(tool)} session on your computer, and it will show up here for quick continue.
            </Text>
        </View>
    );
});

const CliProjectCard = React.memo(({
    project,
    expanded,
    onToggleExpanded,
}: {
    project: CliThreadProjectGroup;
    expanded: boolean;
    onToggleExpanded: () => void;
}) => {
    const styles = stylesheet;
    const longPressTriggeredRef = React.useRef(false);
    const [deleting, deleteProject] = useOrbitAction(async () => {
        await deleteCliProjectGroup(project);
    });

    const requestDeleteProject = React.useCallback(() => {
        longPressTriggeredRef.current = true;
        showDeleteActionSheet(
            t('sessionInfo.deleteProject'),
            t('sessionInfo.deleteProject'),
            () => {
                void (async () => {
                    const confirmed = await Modal.confirm(
                        t('sessionInfo.deleteProject'),
                        t('sessionInfo.deleteProjectWarning'),
                        {
                            cancelText: t('common.cancel'),
                            confirmText: t('common.delete'),
                            destructive: true,
                        },
                    );

                    if (confirmed) {
                        deleteProject();
                    }
                })();
            },
        );
    }, [deleteProject]);

    const handlePress = React.useCallback(() => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }

        if (deleting) {
            return;
        }

        onToggleExpanded();
    }, [deleting, onToggleExpanded]);

    const projectTrigger = (
        <Pressable
            style={styles.projectHeaderRow}
            onPress={handlePress}
            onLongPress={requestDeleteProject}
            delayLongPress={350}
        >
            <View style={styles.projectContent}>
                <Text style={styles.projectTitle} numberOfLines={1}>
                    {project.title}
                </Text>
            </View>
            {deleting ? (
                <ActivityIndicator size="small" color={styles.projectChevron.color as string} />
            ) : (
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    style={styles.projectChevron}
                />
            )}
        </Pressable>
    );

    return (
        <View style={styles.projectCard}>
            {projectTrigger}
            {expanded && (
                <View style={styles.expandedThreads}>
                    {project.items.map((item) => (
                        <CliProjectThreadRow key={item.id} item={item} />
                    ))}
                </View>
            )}
        </View>
    );
});

const CliProjectThreadRow = React.memo(({ item }: { item: CliThreadListItem }) => {
    const styles = stylesheet;
    const navigateToSession = useNavigateToSession();
    const navigateDirectlyToSession = useNavigateDirectlyToSession();
    const longPressTriggeredRef = React.useRef(false);
    const [opening, openThread] = useOrbitAction(async () => {
        await openCliThreadItem(item, {
            navigateToSession,
            navigateDirectlyToSession,
        });
    });
    const [deleting, deleteThread] = useOrbitAction(async () => {
        await deleteCliThreadItem(item);
    });

    const requestDeleteThread = React.useCallback(() => {
        longPressTriggeredRef.current = true;
        showDeleteActionSheet(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSession'),
            () => {
                void (async () => {
                    const confirmed = await Modal.confirm(
                        t('sessionInfo.deleteSession'),
                        t('sessionInfo.deleteSessionWarning'),
                        {
                            cancelText: t('common.cancel'),
                            confirmText: t('common.delete'),
                            destructive: true,
                        },
                    );

                    if (confirmed) {
                        deleteThread();
                    }
                })();
            },
        );
    }, [deleteThread]);

    const handlePress = React.useCallback(() => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }

        if (opening || deleting) {
            return;
        }

        openThread();
    }, [deleting, openThread, opening]);

    const threadTrigger = (
        <Pressable
            style={styles.threadRow}
            onPress={handlePress}
            onLongPress={requestDeleteThread}
            delayLongPress={350}
        >
            <View style={styles.threadRowContent}>
                <Text style={styles.threadRowTitle} numberOfLines={1}>
                    {item.title}
                </Text>
            </View>
            <Text style={styles.threadRowMeta}>
                {deleting ? `${t('common.delete')}...` : opening ? 'Connecting...' : formatCliThreadUpdatedAt(item.updatedAt)}
            </Text>
        </Pressable>
    );

    return threadTrigger;
});
