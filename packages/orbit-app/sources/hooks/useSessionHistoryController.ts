import * as React from 'react';
import { InteractionManager } from 'react-native';

import { useVisibleSessionListViewData, type VisibleSessionListViewItem } from '@/hooks/useVisibleSessionListViewData';
import { useLocalSettingMutable } from '@/sync/storage';
import {
    buildCliThreadToolSectionsState,
    pickPreferredCliThreadTool,
    type CliThreadDisplayTool,
    type CliThreadToolSectionsState,
} from '@/utils/cliThreadList';

const EMPTY_THREAD_SOURCE_ITEMS: VisibleSessionListViewItem[] = [];

export type SessionHistoryViewMode = 'sessions' | 'history';

export function useSessionHistoryController(options: {
    enabled: boolean;
    view: SessionHistoryViewMode;
}): {
    data: VisibleSessionListViewItem[] | null;
    deferredData: VisibleSessionListViewItem[];
    listReady: boolean;
    sectionsState: CliThreadToolSectionsState;
    currentCli: CliThreadDisplayTool;
    sessionCount: number;
} {
    const [preferredCliToolTab] = useLocalSettingMutable('preferredCliToolTab');
    const listInteractionRef = React.useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const data = useVisibleSessionListViewData({
        prioritizeFreshness: false,
        includeAllMachines: options.view === 'history',
        includeNativeCliHistory: options.view === 'history',
        enabled: options.enabled,
    });
    const [listReady, setListReady] = React.useState(options.enabled && data !== null);
    const threadSourceItems = data ?? EMPTY_THREAD_SOURCE_ITEMS;
    const deferredData = React.useDeferredValue(threadSourceItems);
    const sectionsState = React.useMemo(
        () => buildCliThreadToolSectionsState(deferredData),
        [deferredData],
    );
    const currentCli = React.useMemo(
        () => pickPreferredCliThreadTool(sectionsState.sections, preferredCliToolTab),
        [preferredCliToolTab, sectionsState.sections],
    );
    const sessionCount = sectionsState.sectionsByTool[currentCli].count;

    React.useEffect(() => {
        listInteractionRef.current?.cancel();
        if (!options.enabled) {
            setListReady(false);
            return;
        }

        if (data !== null) {
            setListReady(true);
            return;
        }

        setListReady(false);
        listInteractionRef.current = InteractionManager.runAfterInteractions(() => {
            React.startTransition(() => {
                setListReady(true);
            });
        });

        return () => {
            listInteractionRef.current?.cancel();
            listInteractionRef.current = null;
        };
    }, [data, options.enabled]);

    return {
        data,
        deferredData,
        listReady,
        sectionsState,
        currentCli,
        sessionCount,
    };
}
