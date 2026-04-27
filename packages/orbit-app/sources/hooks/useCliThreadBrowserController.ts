import * as React from 'react';
import { FlatList, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useLocalSettingMutable } from '@/sync/storage';
import { requestReview } from '@/utils/requestReview';
import {
    buildCliThreadToolSectionsState,
    pickPreferredCliThreadTool,
    type CliThreadDisplayTool,
    type CliThreadScope,
    type CliThreadToolSection,
    type CliThreadToolSectionsState,
} from '@/utils/cliThreadList';
import type { VisibleSessionListViewItem } from '@/hooks/useVisibleSessionListViewData';

const EMPTY_THREAD_SOURCE_ITEMS: VisibleSessionListViewItem[] = [];

export function useCliThreadBrowserController(options: {
    data: VisibleSessionListViewItem[];
    mode: 'default' | 'drawer';
    drawerView: 'sessions' | 'history';
    precomputedToolSectionsState?: CliThreadToolSectionsState | null;
    preselectedTool?: CliThreadDisplayTool | null;
}): {
    cliThreadScopeByTool: Record<CliThreadDisplayTool, CliThreadScope>;
    expandedProjects: Record<string, boolean>;
    expandedTools: Record<CliThreadDisplayTool, boolean>;
    handlePagerMomentumEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    handleToggleProjectExpanded: (projectId: string) => void;
    handleToggleToolExpanded: (tool: CliThreadDisplayTool) => void;
    pageWidth: number;
    pagerRef: React.RefObject<FlatList<CliThreadToolSection> | null>;
    sections: CliThreadToolSection[];
    sectionsState: CliThreadToolSectionsState;
    selectedTool: CliThreadDisplayTool;
    selectedToolIndex: number;
    setPageWidth: (width: number) => void;
    setToolScope: (tool: CliThreadDisplayTool, scope: CliThreadScope) => void;
    persistPreferredCliToolTab: (tool: CliThreadDisplayTool) => void;
} {
    const windowWidth = useWindowDimensions().width;
    const isDrawerMode = options.mode === 'drawer';
    const [preferredCliToolTab, setPreferredCliToolTab] = useLocalSettingMutable('preferredCliToolTab');
    const [cliThreadScopeByTool, setCliThreadScopeByTool] = useLocalSettingMutable('cliThreadScopeByTool');
    const [expandedTools, setExpandedTools] = React.useState<Record<CliThreadDisplayTool, boolean>>({
        claude: false,
        codex: false,
        gemini: false,
        openclaw: false,
    });
    const [expandedProjects, setExpandedProjects] = React.useState<Record<string, boolean>>({});
    const pagerRef = React.useRef<FlatList<CliThreadToolSection>>(null);
    const lastSyncedToolRef = React.useRef<CliThreadDisplayTool | null>(null);
    const [pageWidth, setPageWidth] = React.useState(windowWidth);
    const [optimisticSelectedTool, setOptimisticSelectedTool] = React.useState<CliThreadDisplayTool | null>(null);
    const deferredData = React.useDeferredValue(options.data);

    const threadSourceItems = React.useMemo(
        () => (isDrawerMode && options.precomputedToolSectionsState
            ? EMPTY_THREAD_SOURCE_ITEMS
            : deferredData),
        [deferredData, isDrawerMode, options.precomputedToolSectionsState],
    );
    const drawerThreadSourceItems = React.useMemo(
        () => {
            if (!isDrawerMode || options.precomputedToolSectionsState) {
                return threadSourceItems;
            }

            return options.drawerView === 'history'
                ? threadSourceItems
                : threadSourceItems.filter((item): item is Extract<VisibleSessionListViewItem, { type: 'session' }> => item.type === 'session');
        },
        [isDrawerMode, options.drawerView, options.precomputedToolSectionsState, threadSourceItems],
    );
    const sectionsState = React.useMemo(
        () => {
            if (isDrawerMode) {
                return options.precomputedToolSectionsState ?? buildCliThreadToolSectionsState(drawerThreadSourceItems);
            }

            return buildCliThreadToolSectionsState(threadSourceItems);
        },
        [drawerThreadSourceItems, isDrawerMode, options.precomputedToolSectionsState, threadSourceItems],
    );
    const selectedTool = React.useMemo(
        () => options.preselectedTool
            ?? optimisticSelectedTool
            ?? pickPreferredCliThreadTool(sectionsState.sections, preferredCliToolTab),
        [optimisticSelectedTool, options.preselectedTool, preferredCliToolTab, sectionsState.sections],
    );
    const sections = React.useMemo(
        () => isDrawerMode
            ? [sectionsState.sectionsByTool[selectedTool]]
            : sectionsState.sections,
        [isDrawerMode, sectionsState.sections, sectionsState.sectionsByTool, selectedTool],
    );
    const selectedToolIndex = React.useMemo(
        () => Math.max(0, sections.findIndex((section) => section.tool === selectedTool)),
        [sections, selectedTool],
    );

    const handleToggleToolExpanded = React.useCallback((tool: CliThreadDisplayTool) => {
        React.startTransition(() => {
            setExpandedTools((current) => ({
                ...current,
                [tool]: !current[tool],
            }));
        });
    }, []);
    const handleToggleProjectExpanded = React.useCallback((projectId: string) => {
        React.startTransition(() => {
            setExpandedProjects((current) => ({
                ...current,
                [projectId]: !(current[projectId] === true),
            }));
        });
    }, []);

    React.useEffect(() => {
        if (!isDrawerMode && options.data.length > 0) {
            requestReview();
        }
    }, [isDrawerMode, options.data.length]);

    React.useEffect(() => {
        if (!optimisticSelectedTool) {
            return;
        }

        if (options.preselectedTool || preferredCliToolTab === optimisticSelectedTool) {
            setOptimisticSelectedTool(null);
        }
    }, [optimisticSelectedTool, options.preselectedTool, preferredCliToolTab]);

    React.useEffect(() => {
        if (isDrawerMode) {
            return;
        }

        lastSyncedToolRef.current = null;
    }, [isDrawerMode, pageWidth]);

    React.useEffect(() => {
        if (isDrawerMode) {
            return;
        }

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
    }, [isDrawerMode, pageWidth, sections, selectedTool, selectedToolIndex]);

    const persistPreferredCliToolTab = React.useCallback((tool: CliThreadDisplayTool) => {
        if (options.preselectedTool || tool === selectedTool) {
            return;
        }

        setOptimisticSelectedTool(tool);
        requestAnimationFrame(() => {
            React.startTransition(() => {
                setPreferredCliToolTab(tool);
            });
        });
    }, [options.preselectedTool, selectedTool, setPreferredCliToolTab]);

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
        persistPreferredCliToolTab(nextTool);
    }, [pageWidth, persistPreferredCliToolTab, sections, selectedTool]);

    const setToolScope = React.useCallback((tool: CliThreadDisplayTool, scope: CliThreadScope) => {
        setCliThreadScopeByTool({
            ...cliThreadScopeByTool,
            [tool]: scope,
        });
    }, [cliThreadScopeByTool, setCliThreadScopeByTool]);

    return {
        cliThreadScopeByTool,
        expandedProjects,
        expandedTools,
        handlePagerMomentumEnd,
        handleToggleProjectExpanded,
        handleToggleToolExpanded,
        pageWidth,
        pagerRef,
        sections,
        sectionsState,
        selectedTool,
        selectedToolIndex,
        setPageWidth,
        setToolScope,
        persistPreferredCliToolTab,
    };
}
