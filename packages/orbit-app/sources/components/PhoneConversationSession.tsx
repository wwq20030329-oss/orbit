import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useShallow } from 'zustand/react/shallow';

import { PhoneConversationShell } from '@/components/PhoneConversationShell';
import { PhoneMessageComposerCard } from '@/components/PhoneMessageComposerCard';
import { MessageView } from '@/components/MessageView';
import { ExecutionChecklistCard } from '@/components/ExecutionChecklistCard';
import { ChatFooter } from '@/components/ChatFooter';
import { RoundButton } from '@/components/RoundButton';
import { Typography } from '@/constants/Typography';
import { getOrbitActionErrorMessage } from '@/hooks/orbitActionError';
import { useDraft } from '@/hooks/useDraft';
import { Modal } from '@/modal';
import { storage, useRemoteSessionView } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { t } from '@/text';
import {
    getAvailableEffortLevels,
    getAvailableSessionModels,
    getAvailableSessionPermissionModes,
    getDefaultEffortKeyForModel,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    resolveCurrentOption,
    type EffortLevel,
} from '@/components/modelModeOptions';
import type { ModelMode, PermissionMode } from '@/components/PermissionModeSelector';
import { getSessionDisplayTitle } from '@/utils/nativeCliHistory';
import { getResumeCommandBlock } from '@/utils/sessionUtils';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { useComposerAttachments } from '@/hooks/useComposerAttachments';
import { buildComposerDisplayText, buildMessageWithAttachments } from '@/utils/composerAttachments';
import { getSessionControlState } from '@/utils/sessionControlState';
import { getPhoneCliLabel, getSessionPhoneCli, PHONE_CLI_TOOL_ORDER, type PhoneCliTool } from '@/utils/phoneCli';
import { activatePhoneWorkspaceSession, clearPhoneWorkspaceSession } from '@/utils/phoneWorkspaceNavigation';
import { shouldAutoResumeSession } from '@/utils/sessionAutoResume';
import { buildSessionExecutionChecklist, type ExecutionChecklist } from '@/utils/sessionExecutionChecklist';
import { useNewSessionDraftActions } from '@/hooks/useNewSessionDraft';
import { useOrbitRemoteSessionManager } from '@/hooks/useOrbitRemoteSessionManager';
import { type PhoneCliPickerConfigSection } from '@/components/PhoneCliPickerSheet';
import type { Option } from '@/components/markdown/MarkdownView';
import { OrbitRemoteSessionManager } from '@/remote/OrbitRemoteSessionManager';
import type { Message } from '@/sync/typesMessage';
import { groupConsecutiveTools, type ReadOnlyToolGroup } from '@/components/tools/groupConsecutiveTools';
import { ToolGroupChip } from '@/components/tools/ToolGroupChip';
import { findPendingPermissions } from '@/utils/findPendingPermissions';
import { PermissionStickyBanner } from '@/components/PermissionStickyBanner';
import { getSessionRunState, type SessionRunState } from '@/utils/sessionRunState';

type PhoneChatListChecklistItem = {
    kind: 'execution-checklist';
    id: string;
    checklist: ExecutionChecklist;
};

type PhoneChatListRunStateItem = {
    kind: 'run-state';
    id: string;
    runState: SessionRunState;
};

type PhoneChatListItem = Message | PhoneChatListChecklistItem | PhoneChatListRunStateItem | ReadOnlyToolGroup;

// FlashList v2 replaces the old FlatList virtualization knobs with
// measurement-driven auto-recycling, so the legacy tuning (initialNumToRender
// / maxToRenderPerBatch / updateCellsBatchingPeriod / windowSize /
// removeClippedSubviews) is gone. See ChatList.tsx for the same migration on
// the tablet/desktop variant.
const PHONE_CHAT_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION = {
    // Inverted chat: start at the bottom so the newest message is visible
    // immediately after the list mounts.
    startRenderingFromBottom: true,
    // The latest item is at offset 0 for an inverted FlashList. Only auto-pin
    // while the user is already close to the newest messages.
    autoscrollToTopThreshold: 0.2,
} as const;

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

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    body: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 12,
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 20,
    },
    composerWrap: {
        paddingBottom: 8,
    },
    pendingPreviewWrap: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        gap: 14,
    },
    pendingPreviewBubble: {
        alignSelf: 'flex-end',
        maxWidth: '85%',
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: theme.colors.button.primary.background,
    },
    pendingPreviewText: {
        color: theme.colors.button.primary.tint,
        fontSize: 15,
        lineHeight: 21,
        ...Typography.default(),
    },
    pendingPreviewMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    pendingPreviewMetaText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        ...Typography.default(),
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    emptyStateIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
    },
    emptyStateTitle: {
        color: theme.colors.text,
        fontSize: 22,
        lineHeight: 28,
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    emptyStateSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        maxWidth: 280,
        ...Typography.default(),
    },
    resumeCard: {
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 10,
        marginBottom: 8,
    },
    resumeTitle: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 18,
        ...Typography.default('semiBold'),
    },
    resumeSubtitle: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default(),
    },
    archivedHint: {
        color: theme.colors.agentEventText,
        fontSize: 13,
        lineHeight: 18,
        ...Typography.default(),
    },
    archivedWrap: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 4,
    },
    runStateInlineWrap: {
        paddingHorizontal: 16,
        paddingVertical: 7,
        alignItems: 'center',
    },
    runStateInlinePill: {
        minHeight: 26,
        borderRadius: 13,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    runStateInlineText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default('semiBold'),
    },
}));

const runStateToneColors: Record<SessionRunState['tone'], string> = {
    neutral: '#8E8E93',
    active: '#007AFF',
    warning: '#FF9500',
    offline: '#8E8E93',
};

const PhoneConversationRunStateInline = React.memo((props: {
    runState: SessionRunState;
}) => {
    const labelKey = props.runState.labelKey;
    const color = runStateToneColors[props.runState.tone];

    if (!props.runState.shouldShowInlineStatus || !labelKey) {
        return null;
    }

    return (
        <View style={stylesheet.runStateInlineWrap}>
            <View style={stylesheet.runStateInlinePill}>
                {props.runState.showsProgress ? (
                    <ActivityIndicator size="small" color={color} />
                ) : (
                    <Ionicons name={props.runState.icon} size={14} color={color} />
                )}
                <Text numberOfLines={1} style={stylesheet.runStateInlineText}>
                    {t(labelKey)}
                </Text>
            </View>
        </View>
    );
});

const PhoneChatList = React.memo((props: {
    sessionId: string;
    metadata: Session['metadata'];
    controlledByUser: boolean;
    messages: Message[];
    executionChecklist: ExecutionChecklist | null;
    runState: SessionRunState;
    markdownCopyV2: boolean;
    onOptionPress: (option: Option) => void;
}) => {
    const listHeader = React.useMemo(() => (
        props.controlledByUser ? <ChatFooter controlledByUser /> : null
    ), [props.controlledByUser]);
    const listFooter = React.useMemo(() => <View style={{ height: 12 }} />, []);
    const listData = React.useMemo<PhoneChatListItem[]>(() => {
        const grouped = groupConsecutiveTools(props.messages);
        const leadingItems: PhoneChatListItem[] = [];

        if (props.runState.shouldShowInlineStatus && props.runState.labelKey) {
            leadingItems.push({
                kind: 'run-state',
                id: `${props.sessionId}:run-state:${props.runState.kind}`,
                runState: props.runState,
            });
        }

        if (props.executionChecklist) {
            leadingItems.push({
                kind: 'execution-checklist',
                id: `${props.sessionId}:execution-checklist`,
                checklist: props.executionChecklist,
            });
        }

        return [
            ...leadingItems,
            ...grouped,
        ];
    }, [props.executionChecklist, props.messages, props.runState, props.sessionId]);
    const listRef = React.useRef<FlashListRef<PhoneChatListItem>>(null);
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

        if (initialScrollSessionRef.current === props.sessionId) {
            return;
        }

        initialScrollSessionRef.current = props.sessionId;
        return scheduleScrollToLatest();
    }, [listData.length, props.sessionId, scheduleScrollToLatest]);
    const keyExtractor = React.useCallback((item: PhoneChatListItem) => item.id, []);
    const renderItem = React.useCallback(({ item }: { item: PhoneChatListItem }) => {
        if (item.kind === 'run-state') {
            return <PhoneConversationRunStateInline runState={item.runState} />;
        }
        if (item.kind === 'execution-checklist') {
            return <ExecutionChecklistCard checklist={item.checklist} variant="inline" />;
        }
        if (item.kind === 'tool-group') {
            return (
                <ToolGroupChip
                    tools={item.tools}
                    metadata={props.metadata}
                    sessionId={props.sessionId}
                    markdownCopyV2={props.markdownCopyV2}
                />
            );
        }

        return (
            <MessageView
                message={item}
                metadata={props.metadata}
                sessionId={props.sessionId}
                markdownCopyV2={props.markdownCopyV2}
                onOptionPress={props.onOptionPress}
            />
        );
    }, [props.markdownCopyV2, props.metadata, props.onOptionPress, props.sessionId]);

    return (
        <FlashList
            ref={listRef}
            data={listData}
            inverted
            initialScrollIndex={listData.length > 0 ? 0 : undefined}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            onLoad={scheduleScrollToLatest}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={stylesheet.listContent}
            maintainVisibleContentPosition={PHONE_CHAT_LIST_MAINTAIN_VISIBLE_CONTENT_POSITION}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
        />
    );
});

function PhoneConversationEmptyState() {
    const { theme } = useUnistyles();

    return (
        <View style={stylesheet.emptyState}>
            <View style={stylesheet.emptyStateIconWrap}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.colors.textSecondary} />
            </View>
            <Text style={stylesheet.emptyStateTitle}>
                {t('newSession.quickModeTitle')}
            </Text>
            <Text style={stylesheet.emptyStateSubtitle}>
                {t('newSession.quickModeSubtitle')}
            </Text>
        </View>
    );
}

function ResumeHint(props: {
    canResume: boolean;
    isLoading: boolean;
    subtitle: string;
    onResume: () => void;
    machineLabel: string | null;
}) {
    return (
        <View style={stylesheet.resumeCard}>
            <View style={{ gap: 4 }}>
                <Text style={stylesheet.resumeTitle}>
                    {props.machineLabel
                        ? `${t('common.continue')} on ${props.machineLabel}`
                        : t('sessionInfo.resumeSession')}
                </Text>
                <Text style={stylesheet.resumeSubtitle}>
                    {props.subtitle}
                </Text>
            </View>
            {props.canResume && (
                <View style={{ alignItems: 'flex-start' }}>
                    <RoundButton
                        size="normal"
                        title={props.machineLabel
                            ? `${t('common.continue')} on ${props.machineLabel}`
                            : t('common.continue')}
                        onPress={props.onResume}
                        loading={props.isLoading}
                    />
                </View>
            )}
        </View>
    );
}

type PhoneConversationSessionProps = {
    sessionId: string;
    nativeConnectionPending?: boolean;
    connectOnMount?: boolean;
};

type RemoteSessionView = {
    session: Session | null;
    messages: Message[];
    isLoaded: boolean;
    isDisconnected: boolean;
    sessionControlState: any;
    pendingSeed: {
        optimisticPendingUserMessage?: string | null;
        optimisticCli?: PhoneCliTool | null;
    } | null;
};

const PhoneConversationContent = React.memo((props: {
    sessionId: string;
    metadata: Session['metadata'];
    controlledByUser: boolean;
    messages: Message[];
    executionChecklist: ExecutionChecklist | null;
    runState: SessionRunState;
    messagesLoaded: boolean;
    pendingMessage: string | null;
    markdownCopyV2: boolean;
    onOptionPress: (option: Option) => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    if (props.messages.length > 0 || props.executionChecklist || props.runState.shouldShowInlineStatus) {
        return (
            <PhoneChatList
                sessionId={props.sessionId}
                metadata={props.metadata}
                controlledByUser={props.controlledByUser}
                messages={props.messages}
                executionChecklist={props.executionChecklist}
                runState={props.runState}
                markdownCopyV2={props.markdownCopyV2}
                onOptionPress={props.onOptionPress}
            />
        );
    }

    if (props.pendingMessage && !props.messagesLoaded) {
        return (
            <View style={styles.pendingPreviewWrap}>
                <View style={styles.pendingPreviewBubble}>
                    <Text style={styles.pendingPreviewText}>
                        {props.pendingMessage}
                    </Text>
                </View>
                <View style={styles.pendingPreviewMeta}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.pendingPreviewMetaText}>
                        {t('terminal.connecting')}
                    </Text>
                </View>
            </View>
        );
    }

    if (props.messagesLoaded) {
        return <PhoneConversationEmptyState />;
    }

    return (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text style={{ color: theme.colors.textSecondary }}>
                {t('terminal.connecting')}
            </Text>
        </View>
    );
});

const PhoneConversationBody = React.memo((props: {
    sessionId: string;
    metadata: Session['metadata'];
    controlledByUser: boolean;
    messages: Message[];
    executionChecklist: ExecutionChecklist | null;
    runState: SessionRunState;
    messagesLoaded: boolean;
    pendingMessage: string | null;
    machineLabel: string | null;
    isInactiveArchivedSession: boolean;
    isDisconnected: boolean;
    canShowResume: boolean;
    canResume: boolean;
    resumingSession: boolean;
    resumeSessionSubtitle: string;
    nativeConnectionPending?: boolean;
    resumeSession: () => void;
    hasResumeCommandBlock: boolean;
    markdownCopyV2: boolean;
    onOptionPress: (option: Option) => void;
}) => (
    <View style={stylesheet.body}>
        <View style={{ flex: 1 }}>
            <PhoneConversationContent
                sessionId={props.sessionId}
                metadata={props.metadata}
                controlledByUser={props.controlledByUser}
                messages={props.messages}
                executionChecklist={props.executionChecklist}
                runState={props.runState}
                messagesLoaded={props.messagesLoaded}
                pendingMessage={props.pendingMessage}
                markdownCopyV2={props.markdownCopyV2}
                onOptionPress={props.onOptionPress}
            />
        </View>

        <PhoneConversationStatus
            machineLabel={props.machineLabel}
            isInactiveArchivedSession={props.isInactiveArchivedSession}
            isDisconnected={props.isDisconnected}
            canShowResume={props.canShowResume}
            canResume={props.canResume}
            resumingSession={props.resumingSession}
            resumeSessionSubtitle={props.resumeSessionSubtitle}
            nativeConnectionPending={props.nativeConnectionPending}
            resumeSession={props.resumeSession}
            hasResumeCommandBlock={props.hasResumeCommandBlock}
        />
    </View>
));

const PhoneConversationStatus = React.memo((props: {
    machineLabel: string | null;
    isInactiveArchivedSession: boolean;
    isDisconnected: boolean;
    canShowResume: boolean;
    canResume: boolean;
    resumingSession: boolean;
    resumeSessionSubtitle: string;
    nativeConnectionPending?: boolean;
    resumeSession: () => void;
    hasResumeCommandBlock: boolean;
}) => {
    const styles = stylesheet;

    if (props.isInactiveArchivedSession) {
        return (
            <View style={styles.archivedWrap}>
                <Text style={styles.archivedHint}>{t('session.inactiveArchived')}</Text>
                {props.hasResumeCommandBlock && (
                    <Text style={styles.archivedHint}>{t('session.resumeFromTerminal')}</Text>
                )}
            </View>
        );
    }

    if (!props.isDisconnected || !props.canShowResume || props.nativeConnectionPending) {
        return null;
    }

    return (
        <ResumeHint
            canResume={props.canResume}
            isLoading={props.resumingSession}
            subtitle={props.resumeSessionSubtitle}
            onResume={props.resumeSession}
            machineLabel={props.machineLabel}
        />
    );
});

const PhoneConversationComposer = React.memo((props: {
    safeAreaBottom: number;
    message: string;
    onChangeText: (value: string) => void;
    onFocus: () => void;
    onKeyPress: (event: { key: 'Enter'; shiftKey: boolean } | any) => boolean;
    onSend: () => void;
    canSend: boolean;
    showAbortButton: boolean;
    onAbort?: () => void;
    runState: SessionRunState;
    chips: any;
    actionTray: any;
    onTrailingActionPress: () => void;
}) => {
    const styles = stylesheet;
    const composerStyle = React.useMemo(() => ([
        styles.composerWrap,
        { paddingBottom: Math.max(8, props.safeAreaBottom) },
    ]), [props.safeAreaBottom]);

    return (
        <View style={composerStyle}>
            <PhoneMessageComposerCard
                value={props.message}
                onChangeText={props.onChangeText}
                placeholder={t('session.inputPlaceholder')}
                onFocus={props.onFocus}
                onKeyPress={props.onKeyPress}
                onSend={props.onSend}
                canSend={props.canSend}
                showAbortButton={props.showAbortButton}
                onAbort={props.showAbortButton ? props.onAbort : undefined}
                chips={props.chips}
                actionTray={props.actionTray}
                trailingActionIcon="add"
                onTrailingActionPress={props.onTrailingActionPress}
            />
        </View>
    );
});

const PhoneConversationComposerContainer = React.memo((props: {
    sessionId: string;
    remoteSessionManager: OrbitRemoteSessionManager;
    safeAreaBottom: number;
    runState: SessionRunState;
    agentInputEnterToSend: boolean;
}) => {
    const [message, setMessage] = React.useState('');
    const { clearDraft } = useDraft(props.sessionId, message, setMessage);
    const [isAttachmentSheetOpen, setAttachmentSheetOpen] = React.useState(false);
    const { attachments, clearAttachments, pickFileAttachments, pickImageAttachments, removeAttachment } = useComposerAttachments();
    const canSend = props.runState.canSendMessages && Boolean(message.trim() || attachments.length > 0);
    const showAbortButton = props.runState.canAbort;

    const attachmentOptions = React.useMemo(() => ([
        {
            key: 'image',
            label: t('common.image'),
            icon: 'image-outline' as const,
            onPress: () => {
                setAttachmentSheetOpen(false);
                void pickImageAttachments();
            },
        },
        {
            key: 'file',
            label: t('common.files'),
            icon: 'document-outline' as const,
            onPress: () => {
                setAttachmentSheetOpen(false);
                void pickFileAttachments();
            },
        },
    ]), [pickFileAttachments, pickImageAttachments]);
    const attachmentChips = React.useMemo(() => (
        attachments.map((attachment) => ({
            key: attachment.id,
            label: attachment.name,
            icon: attachment.kind === 'image' ? 'image-outline' as const : 'document-outline' as const,
            trailingIcon: 'close' as const,
            onPress: () => removeAttachment(attachment.id),
        }))
    ), [attachments, removeAttachment]);
    const handleAttachmentSheetClose = React.useCallback(() => {
        setAttachmentSheetOpen(false);
    }, []);

    const sendCurrentMessage = React.useCallback(async () => {
        if (!props.runState.canSendMessages || (!message.trim() && attachments.length === 0)) {
            return;
        }

        try {
            const outgoingMessage = buildMessageWithAttachments(message, attachments);
            const displayText = buildComposerDisplayText(message, attachments);
            setMessage('');
            clearDraft();
            clearAttachments();
            await props.remoteSessionManager.sendCurrentSessionMessage({
                content: outgoingMessage,
                displayText,
                source: 'chat',
            });
        } catch (error) {
            Modal.alert(t('common.error'), getOrbitActionErrorMessage(error));
        }
    }, [attachments, clearAttachments, clearDraft, message, props.remoteSessionManager, props.runState.canSendMessages]);
    const handleSendPress = React.useCallback(() => {
        void sendCurrentMessage();
    }, [sendCurrentMessage]);
    const handleTrailingActionPress = React.useCallback(() => {
        setAttachmentSheetOpen((current) => !current);
    }, []);
    const handleAbort = React.useCallback(() => props.remoteSessionManager.cancelSession(), [props.remoteSessionManager]);
    const composerActionTray = React.useMemo(() => ({
        visible: isAttachmentSheetOpen,
        items: attachmentOptions,
    }), [attachmentOptions, isAttachmentSheetOpen]);

    const handleKeyPress = React.useCallback((event: { key: 'Enter'; shiftKey: boolean } | any): boolean => {
        if (event.key === 'Enter' && !event.shiftKey && props.agentInputEnterToSend && canSend) {
            void sendCurrentMessage();
            return true;
        }
        return false;
    }, [canSend, props.agentInputEnterToSend, sendCurrentMessage]);

    return (
        <PhoneConversationComposer
            safeAreaBottom={props.safeAreaBottom}
            message={message}
            onChangeText={setMessage}
            onFocus={handleAttachmentSheetClose}
            onKeyPress={handleKeyPress}
            onSend={handleSendPress}
            canSend={canSend}
            showAbortButton={showAbortButton}
            onAbort={showAbortButton ? handleAbort : undefined}
            runState={props.runState}
            chips={attachmentChips}
            actionTray={composerActionTray}
            onTrailingActionPress={handleTrailingActionPress}
        />
    );
});

const PhoneConversationSessionLoaded = React.memo((props: PhoneConversationSessionProps & {
    remoteSessionView: RemoteSessionView;
    session: Session;
    remoteSessionManager: OrbitRemoteSessionManager;
}) => {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const remoteSessionView = props.remoteSessionView;
    const session = props.session;
    const uiState = storage(useShallow((state) => ({
        agentInputEnterToSend: state.settings.agentInputEnterToSend,
        markdownCopyV2: state.localSettings.markdownCopyV2,
    })));
    const { setAgentType: setNewSessionAgentType } = useNewSessionDraftActions();
    const setPreferredCliToolTab = React.useCallback((value: PhoneCliTool) => {
        storage.getState().applyLocalSettings({
            preferredCliToolTab: value,
        });
    }, []);
    const flavor = session.metadata?.flavor;
    const availableModels = getAvailableSessionModels(flavor, session.metadata, t);
    const availableModes = getAvailableSessionPermissionModes(flavor, session.metadata, t);
    const selectedModelKey = session.modelMode ?? session.metadata?.currentModelCode ?? getDefaultModelKey(flavor);
    const availableEffortLevels = getAvailableEffortLevels(flavor, session.metadata, selectedModelKey, t);

    const permissionMode = resolveCurrentOption<PermissionMode>(availableModes, [
        session.permissionMode,
        session.metadata?.currentOperatingModeCode,
        getDefaultPermissionModeKey(flavor),
    ]);
    const modelMode = resolveCurrentOption<ModelMode>(availableModels, [
        session.modelMode,
        session.metadata?.currentModelCode,
        getDefaultModelKey(flavor),
    ]);
    const effortLevel = resolveCurrentOption<EffortLevel>(availableEffortLevels, [
        session.effortLevel,
        session.metadata?.currentThoughtLevelCode,
        getDefaultEffortKeyForModel(flavor, selectedModelKey),
    ]);
    const modelLabel = modelMode?.key === 'default'
        ? t('common.default')
        : modelMode?.name;

    const sessionControlState = remoteSessionView.sessionControlState ?? getSessionControlState(session, { sessionId: props.sessionId });
    const currentCli = getSessionPhoneCli(session);
    const isDisconnected = remoteSessionView.isDisconnected;
    const {
        canResume,
        canShowResume,
        resumeSession,
        resumeSessionSubtitle,
        resumingSession,
    } = useSessionQuickActions(session);
    const autoResumeAttemptRef = React.useRef<string | null>(null);
    const handleStartNewConversation = React.useCallback(() => {
        clearPhoneWorkspaceSession();
    }, []);
    const handleOptionPress = React.useCallback((option: Option) => {
        void props.remoteSessionManager.sendCurrentSessionMessage({
            content: option.title,
            source: 'option',
        }).catch((error) => {
            console.warn('Failed to send message option', error);
        });
    }, [props.remoteSessionManager]);

    const title = getSessionDisplayTitle(session, {}) || session.metadata?.name || t('common.loading');
    const resumeCommandBlock = getResumeCommandBlock(session);
    const autoResumeKey = React.useMemo(
        () => `${session.id}:${session.seq}:${session.activeAt}`,
        [session.activeAt, session.id, session.seq],
    );
    const shouldAutoResume = shouldAutoResumeSession({
        isDisconnected,
        canShowResume,
        canResume,
        resumingSession,
        nativeConnectionPending: props.nativeConnectionPending,
        isInactiveArchivedSession: sessionControlState.isInactiveArchivedSession,
    });
    const connectionPending = props.nativeConnectionPending || resumingSession || shouldAutoResume;
    const executionChecklist = React.useMemo(() => (
        buildSessionExecutionChecklist({
            session: {
                todos: session.todos,
                thinking: session.thinking,
            },
            messages: [],
        })
    ), [
        session.thinking,
        session.todos,
    ]);
    const pendingPermissions = React.useMemo(
        () => findPendingPermissions(remoteSessionView.messages).map((entry) => entry.message),
        [remoteSessionView.messages],
    );
    const runState = React.useMemo(() => getSessionRunState({
        session,
        sessionControlState,
        connectionPending,
    }), [
        connectionPending,
        session.thinking,
        session.metadata?.lifecycleState,
        sessionControlState.isDisconnected,
        sessionControlState.isInactiveArchivedSession,
        sessionControlState.status.state,
    ]);

    React.useEffect(() => {
        if (!shouldAutoResume) {
            if (!isDisconnected || !canShowResume) {
                autoResumeAttemptRef.current = null;
            }
            return;
        }

        if (autoResumeAttemptRef.current === autoResumeKey) {
            return;
        }

        autoResumeAttemptRef.current = autoResumeKey;
        resumeSession();
    }, [autoResumeKey, canShowResume, isDisconnected, resumeSession, shouldAutoResume]);

    const selectEffort = React.useCallback((nextKey: string) => {
        if (nextKey === effortLevel?.key) {
            return;
        }
        storage.getState().updateSessionEffortLevel(props.sessionId, nextKey);
    }, [effortLevel?.key, props.sessionId]);

    const selectModel = React.useCallback((nextKey: string) => {
        if (nextKey === selectedModelKey) {
            return;
        }
        storage.getState().updateSessionModelMode(props.sessionId, nextKey);
        const defaultEffortKey = getDefaultEffortKeyForModel(flavor, nextKey);
        if (defaultEffortKey) {
            storage.getState().updateSessionEffortLevel(props.sessionId, defaultEffortKey);
        }
    }, [flavor, props.sessionId, selectedModelKey]);

    const selectPermission = React.useCallback((nextKey: string) => {
        if (nextKey === (permissionMode?.key ?? getDefaultPermissionModeKey(flavor))) {
            return;
        }
        storage.getState().updateSessionPermissionMode(props.sessionId, nextKey);
    }, [flavor, permissionMode?.key, props.sessionId]);

    const configItems = React.useMemo<import('@/components/PhoneCliPickerSheet').PhoneCliPickerConfigItem[]>(() => ([
        {
            key: 'model',
            label: t('agentInput.model.title'),
            value: modelLabel ?? t('common.default'),
            icon: 'cube-outline',
        },
        {
            key: 'effort',
            label: t('agentInput.effort.title'),
            value: effortLevel?.name ?? t('common.default'),
            icon: 'sparkles-outline',
        },
        {
            key: 'permission',
            label: t('agentInput.permissionMode.title'),
            value: permissionMode?.name ?? t('common.default'),
            icon: 'shield-checkmark-outline',
        },
    ]), [effortLevel?.name, modelLabel, permissionMode?.name]);

    const configSections = React.useMemo<PhoneCliPickerConfigSection[]>(() => ([
        {
            key: 'model',
            title: t('agentInput.model.title'),
            selectedKey: modelMode?.key ?? selectedModelKey,
            options: availableModels.map((mode) => ({
                key: mode.key,
                label: mode.key === 'default' ? t('common.default') : mode.name,
            })),
            onSelect: selectModel,
        },
        {
            key: 'effort',
            title: t('agentInput.effort.title'),
            selectedKey: effortLevel?.key ?? null,
            options: availableEffortLevels.map((level) => ({
                key: level.key,
                label: level.name,
            })),
            onSelect: selectEffort,
        },
        {
            key: 'permission',
            title: t('agentInput.permissionMode.title'),
            selectedKey: permissionMode?.key ?? getDefaultPermissionModeKey(flavor),
            options: availableModes.map((mode) => ({
                key: mode.key,
                label: mode.name,
            })),
            onSelect: selectPermission,
        },
    ]), [
        availableEffortLevels,
        availableModels,
        availableModes,
        effortLevel?.key,
        flavor,
        modelMode?.key,
        permissionMode?.key,
        selectEffort,
        selectModel,
        selectPermission,
        selectedModelKey,
    ]);
    React.useEffect(() => {
        if (storage.getState().localSettings.preferredCliToolTab !== currentCli) {
            setPreferredCliToolTab(currentCli);
        }
    }, [currentCli, setPreferredCliToolTab]);

    const handleSelectCli = React.useCallback((tool: PhoneCliTool) => {
        if (tool === currentCli) {
            return;
        }

        setNewSessionAgentType(tool);
        setPreferredCliToolTab(tool);
        handleStartNewConversation();
    }, [currentCli, handleStartNewConversation, setNewSessionAgentType, setPreferredCliToolTab]);

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
        >
            <PhoneConversationShell
                title={title}
                onTrailingPress={handleStartNewConversation}
                currentCli={currentCli}
                availableCliTools={PHONE_CLI_TOOL_ORDER}
                onSelectCurrentCli={handleSelectCli}
                configItems={configItems}
                configSections={configSections}
            >
                <PhoneConversationBody
                    sessionId={session.id}
                    metadata={session.metadata}
                    controlledByUser={Boolean(session.agentState?.controlledByUser)}
                    messages={remoteSessionView.messages}
                    executionChecklist={executionChecklist}
                    runState={runState}
                    messagesLoaded={remoteSessionView.isLoaded}
                    pendingMessage={remoteSessionView.pendingSeed?.optimisticPendingUserMessage?.trim() ?? null}
                    machineLabel={session.metadata?.host ?? null}
                    isInactiveArchivedSession={sessionControlState.isInactiveArchivedSession}
                    isDisconnected={isDisconnected}
                    canShowResume={canShowResume}
                    canResume={canResume}
                    resumingSession={resumingSession}
                    resumeSessionSubtitle={resumeSessionSubtitle}
                    nativeConnectionPending={connectionPending}
                    resumeSession={resumeSession}
                    hasResumeCommandBlock={Boolean(resumeCommandBlock)}
                    markdownCopyV2={uiState.markdownCopyV2}
                    onOptionPress={handleOptionPress}
                />
                <PermissionStickyBanner
                    pending={pendingPermissions}
                    sessionId={props.sessionId}
                    metadata={session.metadata}
                />
                <PhoneConversationComposerContainer
                    sessionId={props.sessionId}
                    remoteSessionManager={props.remoteSessionManager}
                    safeAreaBottom={safeArea.bottom}
                    runState={runState}
                    agentInputEnterToSend={uiState.agentInputEnterToSend}
                />
            </PhoneConversationShell>
        </KeyboardAvoidingView>
    );
});

export const PhoneConversationSession = React.memo((props: PhoneConversationSessionProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const remoteSessionView = useRemoteSessionView(props.sessionId, {
        nativeConnectionPending: props.nativeConnectionPending,
    });
    const session = remoteSessionView.session;
    const handleSwitchSession = React.useCallback((targetSessionId: string) => {
        activatePhoneWorkspaceSession(targetSessionId);
    }, []);
    const remoteSessionManager = useOrbitRemoteSessionManager(props.sessionId, {
        onSessionRouted: handleSwitchSession,
        onBackgroundError: (error) => {
            console.warn('Failed to refresh phone remote session', error);
        },
    });
    const connectOnMount = props.connectOnMount ?? true;

    React.useEffect(() => {
        if (!connectOnMount || !remoteSessionManager) {
            return;
        }
        remoteSessionManager.connect();
        return () => {
            remoteSessionManager.disconnect();
        };
    }, [connectOnMount, remoteSessionManager]);

    if (!session) {
        if (remoteSessionView.pendingSeed) {
            const pendingMessage = remoteSessionView.pendingSeed.optimisticPendingUserMessage?.trim() ?? null;
            return (
                <PhoneConversationShell
                    title={getPhoneCliLabel(remoteSessionView.pendingSeed.optimisticCli ?? 'claude')}
                >
                    {pendingMessage ? (
                        <View style={styles.pendingPreviewWrap}>
                            <View style={styles.pendingPreviewBubble}>
                                <Text style={styles.pendingPreviewText}>
                                    {pendingMessage}
                                </Text>
                            </View>
                            <View style={styles.pendingPreviewMeta}>
                                <ActivityIndicator size="small" />
                                <Text style={styles.pendingPreviewMetaText}>
                                    {t('terminal.connecting')}
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" />
                            <Text style={{ color: theme.colors.textSecondary }}>
                                {t('terminal.connecting')}
                            </Text>
                        </View>
                    )}
                </PhoneConversationShell>
            );
        }

        return (
            <PhoneConversationShell title={t('errors.sessionDeleted')}>
                <View style={styles.loadingContainer}>
                    <Text style={{ color: theme.colors.textSecondary }}>
                        {t('errors.sessionDeleted')}
                    </Text>
                </View>
            </PhoneConversationShell>
        );
    }

    return (
        <PhoneConversationSessionLoaded
            {...props}
            remoteSessionView={remoteSessionView}
            session={session}
            remoteSessionManager={remoteSessionManager}
        />
    );
});
