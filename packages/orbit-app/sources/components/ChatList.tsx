import * as React from 'react';
import { storage, useSessionMessages } from "@/sync/storage";
import { Platform, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import type { Option } from './markdown/MarkdownView';
import { useOrbitRemoteSessionManager } from '@/hooks/useOrbitRemoteSessionManager';
import { buildSessionExecutionChecklist, type ExecutionChecklist } from '@/utils/sessionExecutionChecklist';
import { ExecutionChecklistCard } from '@/components/ExecutionChecklistCard';
import { layout } from './layout';

// FlashList v2 replaces the old FlatList-era virtualization tuning (initial
// numToRender / maxToRenderPerBatch / updateCellsBatchingPeriod / windowSize /
// removeClippedSubviews) with automatic, measurement-driven recycling, so
// those knobs are not passed anymore — the library's defaults are a strict
// improvement on the hand-tuned FlatList values this file used to carry.
const CHAT_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION = {
    // Start rendering from the bottom so the newest message is visible
    // immediately on first paint in an inverted chat. Equivalent to what
    // the old `autoscrollToTopThreshold` approximated.
    startRenderingFromBottom: true,
    // In an inverted list the latest message lives at scroll offset 0. Keep
    // the feed pinned only when the user is already near the latest message.
    autoscrollToTopThreshold: 0.2,
} as const;

type ChatListProps = {
    session: Session;
    messagesOverride?: Message[];
};

type ExecutionChecklistListItem = {
    kind: 'execution-checklist';
    id: string;
    createdAt: number;
    checklist: ExecutionChecklist;
};

type ChatListItem = Message | ExecutionChecklistListItem;

function hasPendingRequests(session: Session): boolean {
    return Boolean(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);
}

function areChatListPropsEqual(prev: ChatListProps, next: ChatListProps): boolean {
    if (prev.messagesOverride !== next.messagesOverride) {
        return false;
    }

    return prev.session.id === next.session.id
        && prev.session.metadata === next.session.metadata
        && prev.session.todos === next.session.todos
        && prev.session.thinking === next.session.thinking
        && hasPendingRequests(prev.session) === hasPendingRequests(next.session)
        && Boolean(prev.session.agentState?.controlledByUser) === Boolean(next.session.agentState?.controlledByUser);
}

function scheduleScrollFrame(callback: () => void): () => void {
    if (typeof requestAnimationFrame === 'function') {
        const frame = requestAnimationFrame(callback);
        return () => {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(frame);
            }
        };
    }

    const timeout = setTimeout(callback, 0);
    return () => clearTimeout(timeout);
}

export const ChatList = React.memo((props: ChatListProps) => {
    const controlledByUser = props.session.agentState?.controlledByUser ?? false;

    if (props.messagesOverride) {
        return (
            <ChatListInternal
                session={props.session}
                messages={props.messagesOverride}
                controlledByUser={controlledByUser}
            />
        );
    }

    return <ChatListSubscribed session={props.session} />;
}, areChatListPropsEqual);

const ChatListSubscribed = React.memo((props: {
    session: Session;
}) => {
    const { messages } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            session={props.session}
            messages={messages}
            controlledByUser={props.session.agentState?.controlledByUser ?? false}
        />
    );
});

const ListHeader = React.memo(() => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />;
});

const ListFooter = React.memo((props: { controlledByUser: boolean }) => {
    return (
        <ChatFooter controlledByUser={props.controlledByUser} />
    );
});

const ChatListInternal = React.memo((props: {
    session: Session,
    messages: Message[],
    controlledByUser: boolean,
}) => {
    const sessionId = props.session.id;
    const metadata = props.session.metadata;
    const markdownCopyV2 = storage((state) => state.localSettings.markdownCopyV2);
    const remoteSessionManager = useOrbitRemoteSessionManager(sessionId);
    const handleOptionPress = useCallback((option: Option) => {
        if (!remoteSessionManager) {
            return;
        }

        void remoteSessionManager.sendCurrentSessionMessage({
            content: option.title,
            source: 'option',
        }).catch((error) => {
            console.warn('Failed to send message option', error);
        });
    }, [remoteSessionManager]);
    const executionChecklist = React.useMemo(() => (
        buildSessionExecutionChecklist({
            session: {
                todos: props.session.todos,
                thinking: props.session.thinking,
            },
            messages: [],
        })
    ), [props.session.thinking, props.session.todos]);
    const listData = React.useMemo<ChatListItem[]>(() => {
        if (!executionChecklist) {
            return props.messages;
        }

        return [
            {
                kind: 'execution-checklist',
                id: `${sessionId}:execution-checklist`,
                createdAt: Date.now(),
                checklist: executionChecklist,
            },
            ...props.messages,
        ];
    }, [executionChecklist, props.messages, sessionId]);
    const listHeader = React.useMemo(() => (
        <ListFooter controlledByUser={props.controlledByUser} />
    ), [props.controlledByUser]);
    const listFooter = React.useMemo(() => <ListHeader />, []);
    const listRef = React.useRef<FlashListRef<ChatListItem>>(null);
    const initialScrollSessionRef = React.useRef<string | null>(null);
    const scheduleScrollToLatest = React.useCallback(() => (
        scheduleScrollFrame(() => {
            listRef.current?.scrollToTop({ animated: false });
        })
    ), []);
    React.useEffect(() => {
        if (listData.length === 0) {
            return;
        }

        if (initialScrollSessionRef.current === sessionId) {
            return;
        }

        initialScrollSessionRef.current = sessionId;
        return scheduleScrollToLatest();
    }, [listData.length, scheduleScrollToLatest, sessionId]);
    const keyExtractor = useCallback((item: ChatListItem) => item.id, []);
    const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
        if (item.kind === 'execution-checklist') {
            return (
                <ExecutionChecklistMessage checklist={item.checklist} />
            );
        }

        return (
            <MessageView
                message={item}
                metadata={metadata}
                sessionId={sessionId}
                markdownCopyV2={markdownCopyV2}
                onOptionPress={handleOptionPress}
            />
        );
    }, [handleOptionPress, markdownCopyV2, metadata, sessionId]);
    return (
        <FlashList
            ref={listRef}
            data={listData}
            inverted
            initialScrollIndex={listData.length > 0 ? 0 : undefined}
            keyExtractor={keyExtractor}
            maintainVisibleContentPosition={CHAT_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            onLoad={scheduleScrollToLatest}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
        />
    );
});

const ExecutionChecklistMessage = React.memo((props: {
    checklist: ExecutionChecklist;
}) => (
    <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <View style={{
            flexDirection: 'column',
            flexGrow: 1,
            flexBasis: 0,
            maxWidth: layout.maxWidth,
        }}>
            <ExecutionChecklistCard checklist={props.checklist} />
        </View>
    </View>
));
