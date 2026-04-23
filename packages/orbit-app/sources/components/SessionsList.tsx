import React from 'react';
import { View, Pressable, ActivityIndicator, ActionSheetIOS, Platform, FlatList } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from '@/constants/Typography';
import { StyleSheet } from 'react-native-unistyles';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { useNavigateDirectlyToSession, useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import type { VisibleSessionListViewItem } from '@/hooks/useVisibleSessionListViewData';
import { useCliThreadBrowserController } from '@/hooks/useCliThreadBrowserController';
import { deleteCliProjectGroup, deleteCliThreadItem } from '@/utils/cliThreadDelete';
import {
    CLI_THREAD_TOOL_ORDER,
    formatCliThreadUpdatedAt,
    getCliSectionTitle,
    getCliThreadScopedProjects,
    type CliThreadScope,
    type CliThreadProjectGroup,
    type CliThreadToolSection,
    type CliThreadListItem,
    type CliThreadDisplayTool,
    type CliThreadToolSectionsState,
} from '@/utils/cliThreadList';
import { openCliThreadItem } from '@/utils/openCliThreadItem';
import { Modal } from '@/modal';
import { t } from '@/text';
import { activatePhoneWorkspaceSession, shouldUsePhoneWorkspaceNavigation } from '@/utils/phoneWorkspaceNavigation';

const DEFAULT_VISIBLE_PROJECTS = 6;
const DRAWER_VISIBLE_THREADS = 60;

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
        return t('sessionHistory.noWorkYet', { tool: section.title });
    }

    return t('sessionHistory.projectCount', { count: section.projectCount });
}

function getCliSectionScopedSummary(
    section: CliThreadToolSection,
    scope: CliThreadScope,
): string {
    if (section.projectCount === 0) {
        return t('sessionHistory.noWorkYet', { tool: section.title });
    }

    if (scope === 'current-project') {
        return t('sessionHistory.currentProject');
    }

    return getCliSectionSummary(section);
}

type DrawerThreadListRow =
    | { type: 'header'; id: string; title: string }
    | { type: 'item'; id: string; item: CliThreadListItem };

function getDrawerThreadGroupTitle(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();

    if (sameDay) {
        return t('sessionHistory.today');
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
    }).format(date);
}

function buildDrawerThreadRows(items: CliThreadListItem[]): DrawerThreadListRow[] {
    const rows: DrawerThreadListRow[] = [];
    let lastGroupId: string | null = null;

    for (const item of items) {
        const date = new Date(item.updatedAt);
        const groupId = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

        if (groupId !== lastGroupId) {
            lastGroupId = groupId;
            rows.push({
                type: 'header',
                id: `header-${groupId}`,
                title: getDrawerThreadGroupTitle(item.updatedAt),
            });
        }

        rows.push({
            type: 'item',
            id: item.id,
            item,
        });
    }

    return rows;
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
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
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
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
    drawerSectionHeader: {
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 8,
    },
    drawerSectionHeaderText: {
        fontSize: 12,
        color: theme.colors.groupped.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        ...Typography.default('semiBold'),
    },
    drawerThreadRow: {
        minHeight: 56,
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    drawerThreadTitle: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    drawerThreadMeta: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    openingSpinner: {
        color: theme.colors.textSecondary,
    },
}));

interface SessionsListProps {
    data: VisibleSessionListViewItem[];
    mode?: 'default' | 'drawer';
    drawerView?: 'sessions' | 'history';
    onDrawerItemPress?: () => void;
    precomputedToolSectionsState?: CliThreadToolSectionsState | null;
    preselectedTool?: CliThreadDisplayTool | null;
}

type DrawerViewMode = 'sessions' | 'history';

function SessionsListView({
    data,
    mode = 'default',
    drawerView = 'history',
    onDrawerItemPress,
    precomputedToolSectionsState = null,
    preselectedTool = null,
}: SessionsListProps) {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const isDrawerMode = mode === 'drawer';
    const {
        cliThreadScopeByTool,
        expandedProjects,
        expandedTools,
        handlePagerMomentumEnd,
        handleToggleProjectExpanded,
        handleToggleToolExpanded,
        pageWidth,
        pagerRef,
        sections,
        selectedTool,
        selectedToolIndex,
        setPageWidth,
        setToolScope,
        persistPreferredCliToolTab,
    } = useCliThreadBrowserController({
        data,
        mode,
        drawerView,
        precomputedToolSectionsState,
        preselectedTool,
    });
    const renderToolPage = React.useCallback(({ item: section }: { item: CliThreadToolSection }) => (
        <CliToolPage
            section={section}
            pageWidth={pageWidth}
            isStandalone={isDrawerMode}
            selector={isDrawerMode ? (
                <CliToolSelector
                    selectedTool={selectedTool}
                    onSelectTool={persistPreferredCliToolTab}
                />
            ) : null}
            bottomInset={safeArea.bottom}
            scope={cliThreadScopeByTool[section.tool] ?? 'current-project'}
            toolExpanded={expandedTools[section.tool]}
            expandedProjects={expandedProjects}
            onSetScope={setToolScope}
            onToggleToolExpanded={handleToggleToolExpanded}
            onToggleProjectExpanded={handleToggleProjectExpanded}
        />
    ), [
        cliThreadScopeByTool,
        expandedProjects,
        expandedTools,
        handleToggleProjectExpanded,
        handleToggleToolExpanded,
        pageWidth,
        isDrawerMode,
        safeArea.bottom,
        selectedTool,
        persistPreferredCliToolTab,
        setToolScope,
    ]);

    const selectedSection = sections[selectedToolIndex] ?? sections[0] ?? null;

    if (isDrawerMode && selectedSection) {
        return (
            <View style={styles.container}>
                <View style={styles.contentContainer}>
                    <CliDrawerPage
                        section={selectedSection}
                        selector={null}
                        bottomInset={safeArea.bottom}
                        drawerView={drawerView}
                        onDrawerItemPress={onDrawerItemPress}
                    />
                </View>
            </View>
        );
    }

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
                    initialNumToRender={1}
                    maxToRenderPerBatch={2}
                    windowSize={2}
                    onMomentumScrollEnd={handlePagerMomentumEnd}
                    renderItem={renderToolPage}
                />
            </View>
        </View>
    );
}

export const SessionsList = React.memo(SessionsListView);

const CliDrawerHeader = React.memo(({ title }: { title: string }) => {
    const styles = stylesheet;
    return (
        <View style={styles.drawerSectionHeader}>
            <Text style={styles.drawerSectionHeaderText}>{title}</Text>
        </View>
    );
});

const CliDrawerItem = React.memo(({ 
    item, 
    drawerView, 
    onDrawerItemPress 
}: { 
    item: CliThreadListItem; 
    drawerView: DrawerViewMode;
    onDrawerItemPress?: () => void;
}) => {
    return (
        <CliProjectThreadRow
            item={item}
            variant="drawer"
            openMode={drawerView === 'sessions' ? 'direct-session' : 'resolved'}
            onDrawerItemPress={onDrawerItemPress}
        />
    );
});

const CliDrawerPage = React.memo(({
    section,
    selector,
    bottomInset,
    drawerView,
    onDrawerItemPress,
}: {
    section: CliThreadToolSection;
    selector?: React.ReactNode;
    bottomInset: number;
    drawerView: DrawerViewMode;
    onDrawerItemPress?: () => void;
}) => {
    const styles = stylesheet;
    const flattenedItems = React.useMemo(
        () => section.items.slice(0, DRAWER_VISIBLE_THREADS),
        [section.items],
    );
    const rows = React.useMemo(() => buildDrawerThreadRows(flattenedItems), [flattenedItems]);

    const renderItem = React.useCallback(({ item }: { item: DrawerThreadListRow }) => {
        if (item.type === 'header') {
            return <CliDrawerHeader title={item.title} />;
        }

        return (
            <CliDrawerItem
                item={item.item}
                drawerView={drawerView}
                onDrawerItemPress={onDrawerItemPress}
            />
        );
    }, [drawerView, onDrawerItemPress]);

    const headerComponent = React.useMemo(() => (
        selector ? <View style={styles.headerBlock}>{selector}</View> : null
    ), [selector, styles.headerBlock]);

    return (
        // FlashList v2 dropped `estimatedItemSize` (the library now
        // measures items automatically). Keeping the prop around would
        // fail TypeScript and spam warnings at runtime.
        <FlashList
            data={rows}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={headerComponent}
            ListEmptyComponent={<EmptyToolState tool={section.tool} compact />}
            renderItem={renderItem}
            contentContainerStyle={[styles.pageContent, { paddingBottom: bottomInset + 36 }]}
        />
    );
});

const CliToolPage = React.memo(({
    section,
    pageWidth,
    isStandalone = false,
    selector = null,
    bottomInset,
    scope,
    toolExpanded,
    expandedProjects,
    onSetScope,
    onToggleToolExpanded,
    onToggleProjectExpanded,
}: {
    section: CliThreadToolSection;
    pageWidth: number;
    isStandalone?: boolean;
    selector?: React.ReactNode;
    bottomInset: number;
    scope: CliThreadScope;
    toolExpanded: boolean;
    expandedProjects: Record<string, boolean>;
    onSetScope: (tool: CliThreadDisplayTool, scope: CliThreadScope) => void;
    onToggleToolExpanded: (tool: CliThreadDisplayTool) => void;
    onToggleProjectExpanded: (projectId: string) => void;
}) => {
    const styles = stylesheet;
    const scopedProjects = React.useMemo(
        () => getCliThreadScopedProjects(section, scope),
        [scope, section],
    );
    const visibleProjects = React.useMemo(
        () => (toolExpanded
            ? scopedProjects.projects
            : scopedProjects.projects.slice(0, DEFAULT_VISIBLE_PROJECTS)),
        [scopedProjects.projects, toolExpanded],
    );
    const renderProject = React.useCallback(({ item }: { item: CliThreadProjectGroup }) => (
        <CliProjectCard
            project={item}
            expanded={expandedProjects[item.id] === true}
            onToggleExpanded={onToggleProjectExpanded}
        />
    ), [expandedProjects, onToggleProjectExpanded]);
    const header = React.useMemo(() => (
        <CliToolPageHeader
            section={section}
            selector={selector}
            scope={scope}
            scopedProjectCount={scopedProjects.projects.length}
            expanded={toolExpanded}
            onSetScope={onSetScope}
            onToggleExpanded={onToggleToolExpanded}
        />
    ), [onSetScope, onToggleToolExpanded, scope, scopedProjects.projects.length, section, toolExpanded]);

    return (
        <View style={[styles.pageContainer, !isStandalone && { width: pageWidth }]}>
            <FlashList
                data={visibleProjects}
                renderItem={renderProject}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={header}
                ListEmptyComponent={<EmptyToolState tool={section.tool} />}
                contentContainerStyle={[styles.pageContent, { paddingBottom: bottomInset + 128 }]}
            />
        </View>
    );
});

const CliToolPageHeader = React.memo(({
    section,
    selector,
    scope,
    scopedProjectCount,
    expanded,
    onSetScope,
    onToggleExpanded,
}: {
    section: CliThreadToolSection;
    selector?: React.ReactNode;
    scope: CliThreadScope;
    scopedProjectCount: number;
    expanded: boolean;
    onSetScope: (tool: CliThreadDisplayTool, scope: CliThreadScope) => void;
    onToggleExpanded: (tool: CliThreadDisplayTool) => void;
}) => {
    const styles = stylesheet;
    const canExpand = scope === 'all-projects' && scopedProjectCount > DEFAULT_VISIBLE_PROJECTS;

    return (
        <View style={styles.headerBlock}>
            {selector}
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
                        const label = option === 'current-project'
                            ? t('sessionHistory.currentProject')
                            : t('sessionHistory.allProjects');
                        return (
                            <Pressable
                                key={option}
                                style={[
                                    styles.scopeChip,
                                    active && styles.scopeChipActive,
                                ]}
                                onPress={() => {
                                    onSetScope(section.tool, option);
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
                        onToggleExpanded(section.tool);
                    }}
                >
                    <Text style={styles.summaryButtonText}>
                        {expanded ? t('sessionHistory.showLess') : t('sessionHistory.showMore')}
                    </Text>
                </Pressable>
            )}
        </View>
    );
});

const CliToolSelector = React.memo(({
    selectedTool,
    onSelectTool,
}: {
    selectedTool: CliThreadDisplayTool;
    onSelectTool: (tool: CliThreadDisplayTool) => void;
}) => {
    const styles = stylesheet;

    return (
        <View style={styles.scopeRow}>
            {CLI_THREAD_TOOL_ORDER.map((tool) => {
                const active = tool === selectedTool;
                return (
                    <Pressable
                        key={tool}
                        style={[
                            styles.scopeChip,
                            active && styles.scopeChipActive,
                        ]}
                        onPress={() => onSelectTool(tool)}
                    >
                        <Text
                            style={[
                                styles.scopeChipText,
                                active && styles.scopeChipTextActive,
                            ]}
                        >
                            {getCliSectionTitle(tool)}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
});

const EmptyToolState = React.memo(({ tool, compact = false }: { tool: CliThreadDisplayTool; compact?: boolean }) => {
    const styles = stylesheet;

    return (
        <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>
                {t('sessionHistory.noWorkYet', { tool: getCliSectionTitle(tool) })}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
                {compact
                    ? t('sessionHistory.startSessionCompact', { tool: getCliSectionTitle(tool) })
                    : t('sessionHistory.startSessionDetail', { tool: getCliSectionTitle(tool) })}
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
    onToggleExpanded: (projectId: string) => void;
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

        onToggleExpanded(project.id);
    }, [deleting, onToggleExpanded, project.id]);

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

const CliProjectThreadRow = React.memo(({
    item,
    variant = 'default',
    openMode = 'resolved',
    onDrawerItemPress,
}: {
    item: CliThreadListItem;
    variant?: 'default' | 'drawer';
    openMode?: 'resolved' | 'direct-session';
    onDrawerItemPress?: () => void;
}) => {
    const styles = stylesheet;
    const navigateToSession = useNavigateToSession();
    const navigateDirectlyToSession = useNavigateDirectlyToSession();
    const longPressTriggeredRef = React.useRef(false);
    const [opening, openThread] = useOrbitAction(async () => {
        if (openMode === 'direct-session' && item.source === 'session' && item.session) {
            if (shouldUsePhoneWorkspaceNavigation()) {
                activatePhoneWorkspaceSession(item.session.id);
                return;
            }

            navigateDirectlyToSession(item.session.id);
            return;
        }

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

        if (variant === 'drawer') {
            onDrawerItemPress?.();
        }

        openThread();
    }, [deleting, onDrawerItemPress, openThread, opening, variant]);

    const threadTrigger = (
        <Pressable
            style={variant === 'drawer' ? styles.drawerThreadRow : styles.threadRow}
            onPress={handlePress}
            onLongPress={requestDeleteThread}
            delayLongPress={350}
        >
            <View style={styles.threadRowContent}>
                <Text style={variant === 'drawer' ? styles.drawerThreadTitle : styles.threadRowTitle} numberOfLines={1}>
                    {item.title}
                </Text>
            </View>
            <Text style={variant === 'drawer' ? styles.drawerThreadMeta : styles.threadRowMeta}>
                {deleting
                    ? `${t('common.delete')}...`
                    : opening
                        ? t('terminal.connecting')
                        : formatCliThreadUpdatedAt(item.updatedAt)}
            </Text>
        </Pressable>
    );

    return threadTrigger;
});
