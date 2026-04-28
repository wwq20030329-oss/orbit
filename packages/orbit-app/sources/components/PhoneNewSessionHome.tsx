import * as React from 'react';
import {
    ActivityIndicator,
    Keyboard,
    type LayoutChangeEvent,
    Pressable,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

import { Text } from '@/components/StyledText';
import { PhoneMessageComposerCard } from '@/components/PhoneMessageComposerCard';
import {
    type KeyPressEvent,
} from '@/components/MultiTextInput';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { useAllMachines, storage } from '@/sync/storage';
import type { Machine, Session } from '@/sync/storageTypes';
import { isMachineOnline } from '@/utils/machineUtils';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';
import { machineSpawnNewSession } from '@/sync/ops';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';
import { OrbitRemoteSessionManager } from '@/remote/OrbitRemoteSessionManager';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { useComposerAttachments } from '@/hooks/useComposerAttachments';
import { getTerminalAuthPlaceholder } from '@/utils/appUrlScheme';
import { buildComposerDisplayText, buildMessageWithAttachments } from '@/utils/composerAttachments';
import {
    getDefaultEffortKeyForModel,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    getAvailableEffortLevels,
    getHardcodedModelModes,
    getHardcodedPermissionModes,
    type EffortLevel,
    type ModelMode,
    type PermissionMode,
} from '@/components/modelModeOptions';
import { PhoneConversationShell } from '@/components/PhoneConversationShell';
import {
    PhoneCliPickerSheet,
    type PhoneCliPickerConfigSection,
} from '@/components/PhoneCliPickerSheet';
import { getPhoneCliIcon } from '@/utils/phoneCli';
import { activatePhoneWorkspaceSession } from '@/utils/phoneWorkspaceNavigation';
import {
    useNewSessionDraft,
    useNewSessionDraftActions,
    useNewSessionDraftInput,
    useNewSessionDraftValues,
} from '@/hooks/useNewSessionDraft';

type HomeComposerMode = 'quick' | 'expert';
type AgentKey = 'claude' | 'codex' | 'gemini' | 'openclaw';
const EMPTY_RECENT_PATHS: string[] = [];

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    content: {
        flex: 1,
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 0,
    },
    body: {
        flex: 1,
        position: 'relative',
        minHeight: 0,
    },
    hero: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 20,
        paddingTop: 32,
        paddingBottom: 120,
    },
    heroStack: {
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
    },
    heroIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        backgroundColor: theme.colors.surface,
    },
    segmented: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        padding: 4,
        backgroundColor: theme.colors.surface,
        marginBottom: 12,
        overflow: 'hidden',
    },
    segmentedIndicator: {
        position: 'absolute',
        top: 4,
        bottom: 4,
        left: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.button.primary.background,
    },
    segmentedButton: {
        minWidth: 132,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    segmentedButtonForeground: {
        zIndex: 1,
    },
    segmentedLabel: {
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        maxWidth: 300,
        ...Typography.default(),
    },
    modeCopyWrap: {
        width: '100%',
        alignItems: 'center',
    },
    subtitleWrap: {
        width: '100%',
        minHeight: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modeDetailWrap: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    modeDetailSlot: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginTop: 18,
    },
    modeDetailSlotCompact: {
        minHeight: 0,
    },
    modeDetailSlotExpanded: {
        height: 196,
    },
    expertCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 22,
        padding: 16,
        gap: 10,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    expertRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    expertRowButton: {
        minHeight: 46,
        paddingVertical: 2,
    },
    expertLabel: {
        width: 56,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    expertValue: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    expertChevron: {
        marginLeft: 'auto',
    },
    expertButton: {
        marginTop: 4,
        minHeight: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
    },
    expertButtonText: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    connectButtons: {
        width: '100%',
        maxWidth: 320,
        gap: 12,
        marginTop: 22,
    },
    connectButton: {
        minHeight: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.button.primary.background,
    },
    connectButtonSecondary: {
        backgroundColor: theme.colors.surface,
    },
    connectButtonText: {
        fontSize: 15,
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
    composerWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
    },
    machinePickerCard: {
        width: Math.min(layout.maxWidth - 32, 360),
        maxHeight: 480,
        borderRadius: 24,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
    },
    machinePickerHeader: {
        minHeight: 54,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    machinePickerTitle: {
        fontSize: 18,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    machinePickerClose: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    machinePickerScroll: {
        maxHeight: 420,
    },
    machinePickerContent: {
        padding: 10,
        gap: 8,
    },
    machinePickerOption: {
        minHeight: 58,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.groupped.background,
    },
    machinePickerOptionActive: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    machinePickerIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
    },
    machinePickerTextWrap: {
        flex: 1,
    },
    machinePickerName: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    machinePickerMeta: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    projectPickerHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    projectPickerSaveButton: {
        minHeight: 32,
        borderRadius: 999,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
    },
    projectPickerSaveText: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectPickerInputWrap: {
        padding: 10,
        gap: 10,
    },
    projectPickerScrollContent: {
        padding: 10,
        paddingBottom: 12,
    },
    projectPickerSection: {
        borderRadius: 20,
        backgroundColor: theme.colors.groupped.background,
        overflow: 'hidden',
    },
    projectPickerRow: {
        minHeight: 56,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    projectPickerRowActive: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    projectPickerRowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    projectPickerRowTextWrap: {
        flex: 1,
        paddingVertical: 12,
    },
    projectPickerRowTitle: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectPickerRowMeta: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    projectPickerEditor: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    projectPickerInputRow: {
        minHeight: 52,
        borderRadius: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.groupped.background,
    },
    projectPickerInputField: {
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default(),
    },
    projectPickerInlineActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    projectPickerSectionLabel: {
        paddingHorizontal: 4,
        paddingTop: 12,
        paddingBottom: 6,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    projectPickerEmptyText: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));

function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

function trimTrailingPathSeparator(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

function normalizePathForComparison(path: string | null | undefined, homeDir?: string): string | null {
    const trimmed = trimPathInput(path);
    if (!trimmed) {
        return null;
    }
    return trimTrailingPathSeparator(resolveAbsolutePath(trimmed, homeDir));
}

function getMachineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || 'unknown';
}

function getSessionRecencyScore(session: Session): number {
    return Math.max(session.updatedAt, session.activeAt, session.createdAt);
}

async function finalizeNewSessionSetup(options: {
    sessionId: string;
    permissionModeKey: string;
    modelModeKey: string;
    effortLevelKey?: string | null;
    promptToSend: string;
    displayTextToSend?: string;
}) {
    const { sessionId, permissionModeKey, modelModeKey, effortLevelKey, promptToSend, displayTextToSend } = options;
    const remoteSessionManager = new OrbitRemoteSessionManager(sessionId);

    await remoteSessionManager.waitUntilReady();
    storage.getState().updateSessionPermissionMode(sessionId, permissionModeKey);
    storage.getState().updateSessionModelMode(sessionId, modelModeKey);
    if (effortLevelKey) {
        storage.getState().updateSessionEffortLevel(sessionId, effortLevelKey);
    }

    if (promptToSend) {
        await remoteSessionManager.sendCurrentSessionMessage({
            content: promptToSend,
            displayText: displayTextToSend,
            source: 'new_session',
        });
    }
}

const ExpertMachinePickerModal = React.memo((props: {
    machines: Machine[];
    selectedMachineId: string | null;
    onSelectMachine: (machineId: string) => void;
    onClose?: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    return (
        <View style={styles.machinePickerCard}>
            <View style={styles.machinePickerHeader}>
                <Text style={styles.machinePickerTitle}>{t('newSession.machineLabel')}</Text>
                <Pressable style={styles.machinePickerClose} onPress={props.onClose}>
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
            <ScrollView
                style={styles.machinePickerScroll}
                contentContainerStyle={styles.machinePickerContent}
                keyboardShouldPersistTaps="handled"
            >
                {props.machines.map((machine) => {
                    const isActive = machine.id === props.selectedMachineId;
                    const isOnline = isMachineOnline(machine);
                    const metaText = [
                        machine.metadata?.platform ?? machine.metadata?.host ?? '',
                        isOnline ? t('status.online') : t('status.offline'),
                    ].filter(Boolean).join(' · ');

                    return (
                        <Pressable
                            key={machine.id}
                            style={({ pressed }) => [
                                styles.machinePickerOption,
                                isActive && styles.machinePickerOptionActive,
                                pressed && { opacity: 0.86 },
                            ]}
                            onPress={() => {
                                props.onSelectMachine(machine.id);
                                props.onClose?.();
                            }}
                        >
                            <View style={styles.machinePickerIconWrap}>
                                <Ionicons
                                    name={isOnline ? 'desktop-outline' : 'cloud-offline-outline'}
                                    size={18}
                                    color={isOnline ? theme.colors.button.primary.background : theme.colors.textSecondary}
                                />
                            </View>
                            <View style={styles.machinePickerTextWrap}>
                                <Text numberOfLines={1} style={styles.machinePickerName}>
                                    {getMachineName(machine)}
                                </Text>
                                <Text numberOfLines={1} style={styles.machinePickerMeta}>
                                    {metaText}
                                </Text>
                            </View>
                            <Ionicons
                                name={isActive ? 'checkmark-circle' : 'chevron-forward'}
                                size={20}
                                color={isActive ? theme.colors.button.primary.background : theme.colors.textSecondary}
                            />
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
});

const ExpertProjectPickerModal = React.memo((props: {
    initialPath: string;
    homeDir?: string;
    recentPaths: { key: string; label: string }[];
    onSubmitPath: (path: string) => void;
    onClose?: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const inputRef = React.useRef<TextInput>(null);
    const [value, setValue] = React.useState(props.initialPath);
    const [isEditingCustomPath, setIsEditingCustomPath] = React.useState(() => props.recentPaths.length === 0);

    React.useEffect(() => {
        if (!isEditingCustomPath) {
            return undefined;
        }
        const timeout = setTimeout(() => {
            inputRef.current?.focus();
        }, 60);
        return () => clearTimeout(timeout);
    }, [isEditingCustomPath]);

    const matchedPathKey = React.useMemo(() => {
        const normalizedValue = normalizePathForComparison(value, props.homeDir);
        if (!normalizedValue) {
            return null;
        }

        const matchedItem = props.recentPaths.find((item) => (
            normalizePathForComparison(item.key, props.homeDir) === normalizedValue
        ));
        return matchedItem?.key ?? null;
    }, [props.homeDir, props.recentPaths, value]);

    const submitValue = React.useCallback((nextValue?: string) => {
        const resolved = trimPathInput(nextValue ?? value) || '~';
        props.onSubmitPath(resolved);
        props.onClose?.();
    }, [props, value]);

    const currentPathValue = trimPathInput(value) || '~';
    const currentPathLabel = formatPathRelativeToHome(currentPathValue, props.homeDir);
    const visibleRecentPaths = React.useMemo(() => props.recentPaths.filter((item) => (
        normalizePathForComparison(item.key, props.homeDir) !== normalizePathForComparison(currentPathValue, props.homeDir)
    )), [currentPathValue, props.homeDir, props.recentPaths]);

    return (
        <View style={styles.machinePickerCard}>
            <View style={styles.machinePickerHeader}>
                <Text style={styles.machinePickerTitle}>{t('newSession.projectLabel')}</Text>
                <View style={styles.projectPickerHeaderActions}>
                    <Pressable style={styles.machinePickerClose} onPress={props.onClose}>
                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            </View>
            <ScrollView
                style={styles.machinePickerScroll}
                contentContainerStyle={styles.projectPickerScrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.projectPickerSection}>
                    <View style={[styles.projectPickerRow, styles.projectPickerRowActive]}>
                        <View style={styles.machinePickerIconWrap}>
                            <Ionicons
                                name="folder-outline"
                                size={18}
                                color={theme.colors.button.primary.background}
                            />
                        </View>
                        <View style={styles.projectPickerRowTextWrap}>
                            <Text numberOfLines={1} style={styles.projectPickerRowTitle}>
                                {currentPathLabel}
                            </Text>
                            <Text numberOfLines={1} style={styles.projectPickerRowMeta}>
                                {currentPathValue}
                            </Text>
                        </View>
                        <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={theme.colors.button.primary.background}
                        />
                    </View>
                    <Pressable
                        style={({ pressed }) => [
                            styles.projectPickerRow,
                            styles.projectPickerRowDivider,
                            pressed && { opacity: 0.82 },
                        ]}
                        onPress={() => setIsEditingCustomPath((current) => !current)}
                    >
                        <View style={styles.machinePickerIconWrap}>
                            <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
                        </View>
                        <View style={styles.projectPickerRowTextWrap}>
                            <Text style={styles.projectPickerRowTitle}>{t('newSession.customPath')}</Text>
                            <Text numberOfLines={1} style={styles.projectPickerRowMeta}>
                                {props.homeDir ?? '~'}
                            </Text>
                        </View>
                        <Ionicons
                            name={isEditingCustomPath ? 'chevron-up' : 'chevron-forward'}
                            size={18}
                            color={theme.colors.textSecondary}
                        />
                    </Pressable>
                    {isEditingCustomPath ? (
                        <View style={styles.projectPickerEditor}>
                            <View style={styles.projectPickerInputWrap}>
                                <View style={styles.projectPickerInputRow}>
                                    <Ionicons name="folder-outline" size={18} color={theme.colors.textSecondary} />
                                    <TextInput
                                        ref={inputRef}
                                        value={value}
                                        onChangeText={setValue}
                                        placeholder={props.homeDir ?? '~'}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        style={styles.projectPickerInputField}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        multiline={false}
                                        numberOfLines={1}
                                        returnKeyType="done"
                                        onSubmitEditing={() => submitValue()}
                                    />
                                </View>
                                <View style={styles.projectPickerInlineActions}>
                                    <Pressable style={styles.projectPickerSaveButton} onPress={() => submitValue()}>
                                        <Text style={styles.projectPickerSaveText}>{t('common.save')}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    ) : null}
                </View>
                <Text style={styles.projectPickerSectionLabel}>{t('newSession.recentProjects')}</Text>
                <View style={styles.projectPickerSection}>
                    {visibleRecentPaths.length === 0 ? (
                        <Text style={styles.projectPickerEmptyText}>
                            {t('newSession.noRecentProjects')}
                        </Text>
                    ) : visibleRecentPaths.map((item, index) => {
                        const isActive = item.key === matchedPathKey;
                        return (
                            <Pressable
                                key={item.key}
                                style={({ pressed }) => [
                                    styles.projectPickerRow,
                                    index > 0 && styles.projectPickerRowDivider,
                                    isActive && styles.projectPickerRowActive,
                                    pressed && { opacity: 0.86 },
                                ]}
                                onPress={() => submitValue(item.key)}
                            >
                                <View style={styles.machinePickerIconWrap}>
                                    <Ionicons
                                        name="folder-outline"
                                        size={18}
                                        color={theme.colors.textSecondary}
                                    />
                                </View>
                                <View style={styles.projectPickerRowTextWrap}>
                                    <Text numberOfLines={1} style={styles.projectPickerRowTitle}>
                                        {item.label}
                                    </Text>
                                    <Text numberOfLines={1} style={styles.projectPickerRowMeta}>
                                        {item.key}
                                    </Text>
                                </View>
                                <Ionicons
                                    name={isActive ? 'checkmark-circle' : 'chevron-forward'}
                                    size={20}
                                    color={isActive ? theme.colors.button.primary.background : theme.colors.textSecondary}
                                />
                            </Pressable>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
});

const PhoneNewSessionComposer = React.memo((props: {
    inputRef: React.RefObject<import('@/components/MultiTextInput').MultiTextInputHandle | null>;
    isSpawning: boolean;
    sendEnabled: boolean;
    agentInputEnterToSend: boolean;
    activityHint: React.ComponentProps<typeof PhoneMessageComposerCard>['activityHint'];
    attachments: Array<{ id: string; name: string; kind: 'image' | 'file' }>;
    removeAttachment: (id: string) => void;
    actionTray: React.ComponentProps<typeof PhoneMessageComposerCard>['actionTray'];
    onFocus: () => void;
    onSend: () => void;
    onTrailingActionPress: () => void;
}) => {
    const draftInput = useNewSessionDraftInput();
    const canSend = props.sendEnabled && Boolean(draftInput.input.trim() || props.attachments.length > 0);
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        if (event.key === 'Enter' && !event.shiftKey && props.agentInputEnterToSend && canSend) {
            props.onSend();
            return true;
        }
        return false;
    }, [canSend, props]);
    const chips = React.useMemo(() => props.attachments.map((attachment) => ({
        key: attachment.id,
        label: attachment.name,
        icon: attachment.kind === 'image' ? 'image-outline' as const : 'document-outline' as const,
        trailingIcon: 'close' as const,
        onPress: () => props.removeAttachment(attachment.id),
    })), [props.attachments, props.removeAttachment]);

    return (
        <PhoneMessageComposerCard
            inputRef={props.inputRef}
            value={draftInput.input}
            onChangeText={draftInput.setInput}
            placeholder={t('newSession.messagePlaceholder')}
            onFocus={props.onFocus}
            onSend={props.onSend}
            canSend={canSend}
            isSending={props.isSpawning}
            onKeyPress={handleKeyPress}
            activityHint={props.activityHint}
            chips={chips}
            actionTray={props.actionTray}
            trailingActionIcon="add"
            onTrailingActionPress={props.onTrailingActionPress}
        />
    );
});

const PhoneNewSessionHeroPanel = React.memo((props: {
    composerMode: HomeComposerMode;
    displayedMode: HomeComposerMode;
    shouldShowConnectOnboarding: boolean;
    isLoading: boolean;
    selectedMachineName: string | null;
    pathLabel: string;
    expertSettingsSummary: string;
    heroAnimatedStyle: any;
    modeCopyAnimatedStyle: any;
    segmentedIndicatorAnimatedStyle: any;
    onSegmentedLayout: (event: LayoutChangeEvent) => void;
    onComposerModeChange: (mode: HomeComposerMode) => void;
    onConnectTerminal: () => void;
    onManualUrl: () => void;
    onPickMachine: () => void;
    onEditProject: () => void;
    onOpenExpertConfig: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const segmentedIndicatorBaseStyle = React.useMemo(() => ({
        position: 'absolute' as const,
        top: 4,
        bottom: 4,
        left: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.button.primary.background,
    }), [theme.colors.button.primary.background]);

    return (
        <Animated.View pointerEvents="box-none" style={props.heroAnimatedStyle}>
            <View style={styles.hero}>
                <View style={styles.heroStack}>
                    <View style={styles.heroIconWrap}>
                        <Ionicons name="chatbubbles-outline" size={22} color={theme.colors.button.primary.background} />
                    </View>

                    <View onLayout={props.onSegmentedLayout} style={styles.segmented}>
                        <Animated.View style={[segmentedIndicatorBaseStyle, props.segmentedIndicatorAnimatedStyle]} />
                        <Pressable
                            style={[
                                styles.segmentedButton,
                                styles.segmentedButtonForeground,
                            ]}
                            onPress={() => props.onComposerModeChange('quick')}
                        >
                            <Ionicons
                                name="flash-outline"
                                size={16}
                                color={props.composerMode === 'quick' ? theme.colors.button.primary.tint : theme.colors.textSecondary}
                            />
                            <Text
                                style={[
                                    styles.segmentedLabel,
                                    {
                                        color: props.composerMode === 'quick'
                                            ? theme.colors.button.primary.tint
                                            : theme.colors.textSecondary,
                                    },
                                ]}
                            >
                                {t('newSession.quickMode')}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={[
                                styles.segmentedButton,
                                styles.segmentedButtonForeground,
                            ]}
                            onPress={() => props.onComposerModeChange('expert')}
                        >
                            <Ionicons
                                name="diamond-outline"
                                size={16}
                                color={props.composerMode === 'expert' ? theme.colors.button.primary.tint : theme.colors.textSecondary}
                            />
                            <Text
                                style={[
                                    styles.segmentedLabel,
                                    {
                                        color: props.composerMode === 'expert'
                                            ? theme.colors.button.primary.tint
                                            : theme.colors.textSecondary,
                                    },
                                ]}
                            >
                                {t('newSession.expertMode')}
                            </Text>
                        </Pressable>
                    </View>

                    <View style={[styles.modeCopyWrap, styles.subtitleWrap]}>
                        <Animated.View style={props.modeCopyAnimatedStyle}>
                            <Text numberOfLines={2} style={styles.subtitle}>
                                {props.displayedMode === 'quick' ? t('newSession.quickModeSubtitle') : t('newSession.expertModeSubtitle')}
                            </Text>
                        </Animated.View>
                    </View>

                <View
                    style={[
                        styles.modeDetailSlot,
                        props.shouldShowConnectOnboarding || props.displayedMode === 'quick'
                            ? styles.modeDetailSlotCompact
                            : styles.modeDetailSlotExpanded,
                    ]}
                >
                    <View style={styles.modeDetailWrap}>
                        {props.shouldShowConnectOnboarding ? (
                            <View style={styles.connectButtons}>
                                <Pressable style={styles.connectButton} onPress={props.onConnectTerminal}>
                                    {props.isLoading ? (
                                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                    ) : (
                                        <Text style={styles.connectButtonText}>{t('components.emptyMainScreen.openCamera')}</Text>
                                    )}
                                </Pressable>
                                <Pressable
                                    style={[styles.connectButton, styles.connectButtonSecondary]}
                                    onPress={props.onManualUrl}
                                >
                                    <Text style={[styles.connectButtonText, { color: theme.colors.text }]}>{t('connect.enterUrlManually')}</Text>
                                </Pressable>
                            </View>
                        ) : props.displayedMode === 'expert' ? (
                            <View style={styles.expertCard}>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.expertRow,
                                        styles.expertRowButton,
                                        pressed && { opacity: 0.76 },
                                    ]}
                                    onPress={props.onPickMachine}
                                >
                                    <Text style={styles.expertLabel}>{t('newSession.machineLabel')}</Text>
                                    <Text style={styles.expertValue} numberOfLines={1}>
                                        {props.selectedMachineName ?? t('newSession.noMachineSelected')}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} style={styles.expertChevron} />
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.expertRow,
                                        styles.expertRowButton,
                                        pressed && { opacity: 0.76 },
                                    ]}
                                    onPress={props.onEditProject}
                                >
                                    <Text style={styles.expertLabel}>{t('newSession.projectLabel')}</Text>
                                    <Text style={styles.expertValue} numberOfLines={1}>
                                        {props.pathLabel}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} style={styles.expertChevron} />
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.expertRow,
                                        styles.expertRowButton,
                                        pressed && { opacity: 0.76 },
                                    ]}
                                    onPress={props.onOpenExpertConfig}
                                >
                                    <Text style={styles.expertLabel}>{t('newSession.advancedSettings')}</Text>
                                    <Text style={styles.expertValue} numberOfLines={1}>
                                        {props.expertSettingsSummary}
                                    </Text>
                                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} style={styles.expertChevron} />
                                </Pressable>
                            </View>
                        ) : null}
                    </View>
                </View>
                </View>
            </View>
        </Animated.View>
    );
}, (prev, next) => (
    prev.composerMode === next.composerMode
    && prev.displayedMode === next.displayedMode
    && prev.shouldShowConnectOnboarding === next.shouldShowConnectOnboarding
    && prev.isLoading === next.isLoading
    && prev.selectedMachineName === next.selectedMachineName
    && prev.pathLabel === next.pathLabel
    && prev.expertSettingsSummary === next.expertSettingsSummary
    && prev.heroAnimatedStyle === next.heroAnimatedStyle
    && prev.modeCopyAnimatedStyle === next.modeCopyAnimatedStyle
    && prev.segmentedIndicatorAnimatedStyle === next.segmentedIndicatorAnimatedStyle
    && prev.onSegmentedLayout === next.onSegmentedLayout
    && prev.onComposerModeChange === next.onComposerModeChange
    && prev.onConnectTerminal === next.onConnectTerminal
    && prev.onManualUrl === next.onManualUrl
    && prev.onPickMachine === next.onPickMachine
    && prev.onEditProject === next.onEditProject
    && prev.onOpenExpertConfig === next.onOpenExpertConfig
));

export const PhoneNewSessionHome = React.memo(() => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigation = useNavigation();
    const safeArea = useSafeAreaInsets();
    const draftValues = useNewSessionDraftValues();
    const draftActions = useNewSessionDraftActions();
    const allMachines = useAllMachines({ includeOffline: true });
    const agentInputEnterToSend = storage((state) => state.settings.agentInputEnterToSend);
    const preferredCliToolTab = storage((state) => state.localSettings.preferredCliToolTab);
    const setPreferredCliToolTab = React.useCallback((value: typeof preferredCliToolTab) => {
        storage.getState().applyLocalSettings({
            preferredCliToolTab: value,
        });
    }, []);
    const [composerMode, setComposerMode] = React.useState<HomeComposerMode>('quick');
    const [displayedMode, setDisplayedMode] = React.useState<HomeComposerMode>('quick');
    const [isExpertConfigOpen, setIsExpertConfigOpen] = React.useState(false);
    const [expertConfigSection, setExpertConfigSection] = React.useState<PhoneCliPickerConfigSection['key'] | null>(null);
    const [segmentedWidth, setSegmentedWidth] = React.useState(0);
    const [effortIndex, setEffortIndex] = React.useState(0);
    const [isSpawning, setIsSpawning] = React.useState(false);
    const [isAttachmentSheetOpen, setAttachmentSheetOpen] = React.useState(false);
    const { attachments, clearAttachments, pickFileAttachments, pickImageAttachments, removeAttachment } = useComposerAttachments();
    const composerInputRef = React.useRef<import('@/components/MultiTextInput').MultiTextInputHandle>(null);
    const modeTransitionIdRef = React.useRef(0);
    const { connectTerminal, connectWithUrl, isLoading } = useConnectTerminal();
    const keyboard = useReanimatedKeyboardAnimation();
    const modeContentProgress = useSharedValue(1);
    const segmentedProgress = useSharedValue(0);

    const selectedMachineId = draftValues.selectedMachineId;
    const selectedPath = draftValues.selectedPath;
    const selectedAgent = draftValues.agentType;
    const selectedPermissionMode = draftValues.permissionMode;
    const selectedModelMode = draftValues.modelMode;

    React.useEffect(() => {
        if (selectedMachineId) {
            return;
        }

        const preferredMachine = allMachines.find((machine) => isMachineOnline(machine)) ?? allMachines[0];
        if (preferredMachine) {
            draftActions.setMachineId(preferredMachine.id);
        }
    }, [allMachines, draftActions, selectedMachineId]);

    const selectedMachine = React.useMemo(
        () => allMachines.find((machine) => machine.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;
    const sessions = storage((state) => state.sessions);
    const recentSessionPaths = React.useMemo(() => {
        if (!selectedMachineId) {
            return EMPTY_RECENT_PATHS;
        }

        const uniquePaths = new Set<string>();
        return Object.values(sessions)
            .filter((session) => session.metadata?.machineId === selectedMachineId && Boolean(session.metadata?.path))
            .sort((left, right) => getSessionRecencyScore(right) - getSessionRecencyScore(left))
            .flatMap((session) => {
                const path = session.metadata?.path;
                if (!path || uniquePaths.has(path)) {
                    return EMPTY_RECENT_PATHS;
                }

                uniquePaths.add(path);
                return [path];
            });
    }, [sessions, selectedMachineId]);
    const hasAnySessionHistory = storage((state) => Object.keys(state.sessions).length > 0);

    const pathItems = React.useMemo(() => {
        if (!selectedMachineId) {
            return [] as { key: string; label: string }[];
        }

        const homeDir = selectedMachine?.metadata?.homeDir;
        const normalizedHomeDir = normalizePathForComparison(homeDir, homeDir);
        const prioritizedPaths = [
            ...recentSessionPaths.filter((path) => normalizePathForComparison(path, homeDir) !== normalizedHomeDir),
            ...recentSessionPaths.filter((path) => normalizePathForComparison(path, homeDir) === normalizedHomeDir),
        ];

        return prioritizedPaths.map((path) => ({
            key: path,
            label: formatPathRelativeToHome(path, homeDir),
        }));
    }, [recentSessionPaths, selectedMachine, selectedMachineId]);

    const recentPath = React.useMemo(
        () => pathItems[0]?.key ?? null,
        [pathItems],
    );

    React.useEffect(() => {
        if (!recentPath || !selectedMachineId) {
            return;
        }

        const normalizedSelectedPath = normalizePathForComparison(selectedPath, selectedHomeDir);
        const normalizedHomeDir = normalizePathForComparison(selectedHomeDir, selectedHomeDir);
        if (normalizedSelectedPath !== null && normalizedSelectedPath !== normalizedHomeDir) {
            return;
        }

        draftActions.setPath(recentPath);
    }, [draftActions, recentPath, selectedHomeDir, selectedMachineId, selectedPath]);

    const availableAgents = React.useMemo(() => {
        const availability = selectedMachine?.metadata?.cliAvailability;
        const allAgentKeys: AgentKey[] = ['claude', 'codex', 'openclaw', 'gemini'];
        if (!availability) {
            return allAgentKeys;
        }
        return allAgentKeys.filter((agent) => availability[agent]);
    }, [selectedMachine]);

    React.useEffect(() => {
        if (preferredCliToolTab && selectedAgent !== preferredCliToolTab && availableAgents.includes(preferredCliToolTab)) {
            draftActions.setAgentType(preferredCliToolTab);
        }
    }, [availableAgents, draftActions, preferredCliToolTab, selectedAgent]);

    React.useEffect(() => {
        if (availableAgents.length > 0 && !availableAgents.includes(selectedAgent)) {
            draftActions.setAgentType(availableAgents[0]);
        }
    }, [availableAgents, draftActions, selectedAgent]);

    React.useEffect(() => {
        if (preferredCliToolTab !== selectedAgent) {
            setPreferredCliToolTab(selectedAgent);
        }
    }, [preferredCliToolTab, selectedAgent, setPreferredCliToolTab]);

    const permissionModes = React.useMemo<PermissionMode[]>(
        () => getHardcodedPermissionModes(selectedAgent, t),
        [selectedAgent],
    );
    const modelModes = React.useMemo<ModelMode[]>(
        () => getHardcodedModelModes(selectedAgent, t),
        [selectedAgent],
    );
    const defaultModelKey = getDefaultModelKey(selectedAgent);
    const selectedModel = modelModes.find((mode) => mode.key === selectedModelMode)
        ?? modelModes.find((mode) => mode.key === defaultModelKey)
        ?? modelModes[0];
    const activeModel = selectedModel;
    const currentModelKey = activeModel?.key ?? 'default';

    const effortLevels = React.useMemo<EffortLevel[]>(
        () => getAvailableEffortLevels(selectedAgent, null, currentModelKey, t),
        [currentModelKey, selectedAgent],
    );

    React.useEffect(() => {
        const defaultEffort = getDefaultEffortKeyForModel(selectedAgent, currentModelKey);
        const defaultIndex = effortLevels.findIndex((level) => level.key === defaultEffort);
        setEffortIndex(defaultIndex >= 0 ? defaultIndex : 0);
    }, [currentModelKey, effortLevels, selectedAgent]);

    const activeEffort = effortLevels[effortIndex] ?? effortLevels[0] ?? null;
    const defaultPermissionKey = getDefaultPermissionModeKey(selectedAgent);
    const activePermission = permissionModes.find((mode) => mode.key === selectedPermissionMode)
        ?? permissionModes.find((mode) => mode.key === defaultPermissionKey)
        ?? permissionModes[0];

    const hasOnlineMachines = React.useMemo(
        () => allMachines.some((machine) => isMachineOnline(machine)),
        [allMachines],
    );
    const hasKnownMachineHistory = React.useMemo(
        () => allMachines.length > 0 || hasAnySessionHistory,
        [allMachines.length, hasAnySessionHistory],
    );
    const shouldShowConnectOnboarding = !hasOnlineMachines && !hasKnownMachineHistory;
    const pathToUse = React.useMemo(() => {
        const preferredPath = trimPathInput(selectedPath) || trimPathInput(recentPath);
        if (preferredPath) {
            return preferredPath;
        }
        return '~';
    }, [recentPath, selectedPath]);

    const pathLabel = React.useMemo(
        () => formatPathRelativeToHome(pathToUse, selectedHomeDir),
        [pathToUse, selectedHomeDir],
    );
    const composerActivityHint = React.useMemo(() => {
        if (!selectedMachine) {
            return null;
        }

        return {
            key: `new-session-context-${selectedAgent}-${composerMode}-${selectedMachine.id}-${pathToUse}`,
            text: `${getMachineName(selectedMachine)} · ${pathLabel}`,
            kind: 'info' as const,
            icon: getPhoneCliIcon(selectedAgent),
        };
    }, [composerMode, pathLabel, pathToUse, selectedAgent, selectedMachine]);
    const selectedMachineName = React.useMemo(
        () => (selectedMachine ? getMachineName(selectedMachine) : null),
        [selectedMachine],
    );

    const composerSendEnabled = Boolean(
        selectedMachineId
        && selectedMachine
        && isMachineOnline(selectedMachine)
        && !isSpawning,
    );

    const activeModelLabel = activeModel?.key === 'default'
        ? t('common.default')
        : activeModel?.name;
    const expertSettingsSummary = [
        activeModelLabel ?? t('common.default'),
        activeEffort?.name ?? t('common.default'),
        activePermission?.name ?? t('common.default'),
    ].join(' · ');

    const selectEffort = React.useCallback((nextKey: string) => {
        const nextIndex = effortLevels.findIndex((level) => level.key === nextKey);
        if (nextIndex < 0 || nextIndex === effortIndex) {
            return;
        }
        setEffortIndex(nextIndex);
    }, [effortIndex, effortLevels]);

    const selectModel = React.useCallback((nextKey: string) => {
        if (nextKey === currentModelKey) {
            return;
        }
        draftActions.setModelMode(nextKey);
    }, [currentModelKey, draftActions]);

    const selectPermission = React.useCallback((nextKey: string) => {
        if (nextKey === (activePermission?.key ?? defaultPermissionKey)) {
            return;
        }
        draftActions.setPermissionMode(nextKey);
    }, [activePermission?.key, defaultPermissionKey, draftActions]);

    const configItems = React.useMemo<import('@/components/PhoneCliPickerSheet').PhoneCliPickerConfigItem[]>(() => ([
        {
            key: 'model',
            label: t('agentInput.model.title'),
            value: activeModelLabel ?? t('common.default'),
            icon: 'cube-outline',
        },
        {
            key: 'effort',
            label: t('agentInput.effort.title'),
            value: activeEffort?.name ?? t('common.default'),
            icon: 'sparkles-outline',
        },
        {
            key: 'permission',
            label: t('agentInput.permissionMode.title'),
            value: activePermission?.name ?? t('common.default'),
            icon: 'shield-checkmark-outline',
        },
    ]), [activeEffort?.name, activeModelLabel, activePermission?.name]);

    const configSections = React.useMemo<PhoneCliPickerConfigSection[]>(() => ([
        {
            key: 'model',
            title: t('agentInput.model.title'),
            selectedKey: activeModel?.key ?? currentModelKey,
            options: modelModes.map((mode) => ({
                key: mode.key,
                label: mode.key === 'default' ? `${t('common.default')} (${selectedAgent})` : mode.name,
            })),
            onSelect: selectModel,
        },
        {
            key: 'effort',
            title: t('agentInput.effort.title'),
            selectedKey: activeEffort?.key ?? null,
            options: effortLevels.map((level) => ({
                key: level.key,
                label: level.name,
            })),
            onSelect: selectEffort,
        },
        {
            key: 'permission',
            title: t('agentInput.permissionMode.title'),
            selectedKey: activePermission?.key ?? defaultPermissionKey,
            options: permissionModes.map((mode) => ({
                key: mode.key,
                label: mode.name,
            })),
            onSelect: selectPermission,
        },
    ]), [
        activeEffort?.key,
        activeModel?.key,
        activePermission?.key,
        currentModelKey,
        defaultPermissionKey,
        effortLevels,
        modelModes,
        permissionModes,
        selectEffort,
        selectModel,
        selectPermission,
        selectedAgent,
    ]);
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
    const composerActionTray = React.useMemo(() => ({
        visible: isAttachmentSheetOpen,
        items: attachmentOptions,
    }), [attachmentOptions, isAttachmentSheetOpen]);
    const handleComposerFocus = React.useCallback(() => {
        setAttachmentSheetOpen(false);
    }, []);
    const handleComposerTrailingActionPress = React.useCallback(() => {
        setAttachmentSheetOpen((current) => !current);
    }, []);

    const finishModeTransition = React.useCallback((nextMode: HomeComposerMode, transitionId: number) => {
        if (modeTransitionIdRef.current !== transitionId) {
            return;
        }

        setDisplayedMode(nextMode);
        modeContentProgress.value = withTiming(1, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
        });
    }, [modeContentProgress]);

    const handleComposerModeChange = React.useCallback((nextMode: HomeComposerMode) => {
        if (nextMode === composerMode) {
            return;
        }

        modeTransitionIdRef.current += 1;
        const transitionId = modeTransitionIdRef.current;
        setComposerMode(nextMode);

        modeContentProgress.value = withTiming(0, {
            duration: 100,
            easing: Easing.inOut(Easing.quad),
        }, (finished) => {
            if (!finished) {
                return;
            }
            runOnJS(finishModeTransition)(nextMode, transitionId);
        });
    }, [composerMode, finishModeTransition, modeContentProgress]);

    const resetDraft = React.useCallback(() => {
        draftActions.setInput('');
        clearAttachments();
        if (composerMode !== 'quick') {
            handleComposerModeChange('quick');
        }
        composerInputRef.current?.focus();
    }, [clearAttachments, composerMode, draftActions, handleComposerModeChange]);

    const handleSelectCli = React.useCallback((nextAgent: AgentKey) => {
        draftActions.setAgentType(nextAgent);
        setPreferredCliToolTab(nextAgent);
    }, [draftActions, setPreferredCliToolTab]);

    const navigateToHomeSession = React.useCallback((sessionId: string, optimisticPendingUserMessage?: string | null) => {
        activatePhoneWorkspaceSession(sessionId, {
            optimisticPendingUserMessage: optimisticPendingUserMessage?.trim() || null,
            optimisticCli: selectedAgent,
        });
    }, [selectedAgent]);

    const handleSend = React.useCallback(async () => {
        if (!selectedMachineId || !selectedMachine) {
            Modal.alert(t('common.error'), t('newSession.machineOffline'));
            return;
        }
        if (!isMachineOnline(selectedMachine)) {
            Modal.alert(t('common.error'), t('newSession.machineOffline'));
            return;
        }

        setIsSpawning(true);
        try {
            const absolutePath = resolveAbsolutePath(pathToUse, selectedMachine.metadata?.homeDir);
            const currentInput = useNewSessionDraft.getState().input;

            sync.applySettings({
                lastUsedAgent: selectedAgent,
                lastUsedPermissionMode: activePermission?.key ?? defaultPermissionKey,
                lastUsedModelMode: currentModelKey,
            });

            const result = await machineSpawnNewSession({
                machineId: selectedMachineId,
                directory: absolutePath,
                agent: selectedAgent,
            });

            switch (result.type) {
                case 'success':
                    const promptToSend = buildMessageWithAttachments(currentInput, attachments);
                    const displayTextToSend = buildComposerDisplayText(currentInput, attachments);
                    draftActions.setInput('');
                    clearAttachments();
                    navigateToHomeSession(result.sessionId, displayTextToSend || currentInput.trim());
                    void sync.refreshSessions();
                    void finalizeNewSessionSetup({
                        sessionId: result.sessionId,
                        permissionModeKey: activePermission?.key ?? defaultPermissionKey,
                        modelModeKey: currentModelKey,
                        effortLevelKey: activeEffort?.key,
                        promptToSend,
                        displayTextToSend,
                    }).catch((error) => {
                        console.warn('Failed to finish new session setup', error);
                    });
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(
                        t('newSession.createDirectoryTitle'),
                        t('newSession.createDirectoryBody', { directory: result.directory }),
                        { cancelText: t('common.cancel'), confirmText: t('common.create') },
                    );
                    if (approved) {
                        const retry = await machineSpawnNewSession({
                            machineId: selectedMachineId,
                            directory: absolutePath,
                            approvedNewDirectoryCreation: true,
                            agent: selectedAgent,
                        });
                        if (retry.type === 'success') {
                            const promptToSend = buildMessageWithAttachments(currentInput, attachments);
                            const displayTextToSend = buildComposerDisplayText(currentInput, attachments);
                            draftActions.setInput('');
                            clearAttachments();
                            navigateToHomeSession(retry.sessionId, displayTextToSend || currentInput.trim());
                            void sync.refreshSessions();
                            void finalizeNewSessionSetup({
                                sessionId: retry.sessionId,
                                permissionModeKey: activePermission?.key ?? defaultPermissionKey,
                                modelModeKey: currentModelKey,
                                effortLevelKey: activeEffort?.key,
                                promptToSend,
                                displayTextToSend,
                            }).catch((error) => {
                                console.warn('Failed to finish retried new session setup', error);
                            });
                        } else if (retry.type === 'error') {
                            Modal.alert(t('common.error'), retry.errorMessage);
                        }
                    }
                    break;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start session';
            Modal.alert(t('common.error'), message);
        } finally {
            setIsSpawning(false);
        }
    }, [
        activeEffort?.key,
        activePermission?.key,
        attachments,
        clearAttachments,
        currentModelKey,
        defaultPermissionKey,
        draftActions,
        navigateToHomeSession,
        pathToUse,
        selectedAgent,
        selectedMachine,
        selectedMachineId,
    ]);
    const handleComposerSend = React.useCallback(() => {
        void handleSend();
    }, [handleSend]);

    const handleManualUrl = React.useCallback(async () => {
        const url = await Modal.prompt(
            t('modals.authenticateTerminal'),
            t('modals.pasteUrlFromTerminal'),
            {
                placeholder: getTerminalAuthPlaceholder(),
                cancelText: t('common.cancel'),
                confirmText: t('common.authenticate'),
                inputType: 'url',
            },
        );

        if (url?.trim()) {
            connectWithUrl(url.trim());
        }
    }, [connectWithUrl]);

    const openExpertConfig = React.useCallback((section: PhoneCliPickerConfigSection['key'] | null = null) => {
        Keyboard.dismiss();
        setExpertConfigSection(section);
        setIsExpertConfigOpen(true);
    }, []);

    const closeExpertConfig = React.useCallback(() => {
        setIsExpertConfigOpen(false);
        setExpertConfigSection(null);
    }, []);

    const handleSelectMachine = React.useCallback((machineId: string) => {
        if (machineId === selectedMachineId) {
            return;
        }
        draftActions.setMachineId(machineId);
    }, [draftActions, selectedMachineId]);

    const handlePickMachine = React.useCallback(() => {
        Keyboard.dismiss();
        if (allMachines.length === 0) {
            Modal.alert(t('common.error'), t('newSession.noMachineSelected'));
            return;
        }

        const machines = [...allMachines].sort((left, right) => {
            const leftOnline = isMachineOnline(left) ? 1 : 0;
            const rightOnline = isMachineOnline(right) ? 1 : 0;
            return rightOnline - leftOnline;
        });

        Modal.show({
            component: ExpertMachinePickerModal,
            props: {
                machines,
                selectedMachineId,
                onSelectMachine: handleSelectMachine,
            },
        });
    }, [allMachines, handleSelectMachine, selectedMachineId]);

    const handleSetProjectPath = React.useCallback((nextPath: string) => {
        draftActions.setPath(trimPathInput(nextPath) || '~');
    }, [draftActions]);

    const handleEditProject = React.useCallback(() => {
        Keyboard.dismiss();
        Modal.show({
            component: ExpertProjectPickerModal,
            props: {
                initialPath: pathToUse,
                homeDir: selectedHomeDir,
                recentPaths: pathItems,
                onSubmitPath: handleSetProjectPath,
            },
        });
    }, [handleSetProjectPath, pathItems, pathToUse, selectedHomeDir]);
    const handleOpenExpertConfigFromCard = React.useCallback(() => {
        openExpertConfig();
    }, [openExpertConfig]);
    const handleEditProjectFromCard = React.useCallback(() => {
        void handleEditProject();
    }, [handleEditProject]);

    const handleSegmentedLayout = React.useCallback((event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;
        setSegmentedWidth((previousWidth) => (
            Math.abs(previousWidth - nextWidth) < 1 ? previousWidth : nextWidth
        ));
    }, []);

    React.useEffect(() => {
        segmentedProgress.value = withTiming(composerMode === 'expert' ? 1 : 0, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
        });
    }, [composerMode, segmentedProgress]);

    const heroAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateY: keyboard.height.value * keyboard.progress.value * 0.28,
            },
        ],
    }), [keyboard]);

    const segmentedIndicatorAnimatedStyle = useAnimatedStyle(() => {
        const indicatorWidth = Math.max((segmentedWidth - 8) / 2, 0);
        return {
            opacity: indicatorWidth > 0 ? 1 : 0,
            width: indicatorWidth,
            transform: [
                {
                    translateX: segmentedProgress.value * indicatorWidth,
                },
            ],
        };
    }, [segmentedProgress, segmentedWidth]);

    const modeCopyAnimatedStyle = useAnimatedStyle(() => ({
        opacity: 0.72 + (modeContentProgress.value * 0.28),
    }), [modeContentProgress]);

    const composerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateY: keyboard.height.value + safeArea.bottom * keyboard.progress.value,
            },
        ],
    }), [keyboard, safeArea.bottom]);

    return (
        <View style={styles.container}>
            <PhoneConversationShell
                title=""
                leadingIcon="menu"
                onLeadingPress={() => navigation.dispatch(DrawerActions.openDrawer())}
                trailingIcon="add-circle-outline"
                onTrailingPress={resetDraft}
                currentCli={selectedAgent}
                availableCliTools={availableAgents}
                onSelectCurrentCli={handleSelectCli}
                configItems={configItems}
                configSections={configSections}
            >
                <View style={[styles.content, { paddingTop: 0 }]}>
                    <View style={styles.body}>
                        <Pressable
                            style={{ flex: 1 }}
                            onPress={() => Keyboard.dismiss()}
                            accessible={false}
                        >
                            <PhoneNewSessionHeroPanel
                                composerMode={composerMode}
                                displayedMode={displayedMode}
                                shouldShowConnectOnboarding={shouldShowConnectOnboarding}
                                isLoading={isLoading}
                                selectedMachineName={selectedMachineName}
                                pathLabel={pathLabel}
                                expertSettingsSummary={expertSettingsSummary}
                                heroAnimatedStyle={heroAnimatedStyle}
                                modeCopyAnimatedStyle={modeCopyAnimatedStyle}
                                segmentedIndicatorAnimatedStyle={segmentedIndicatorAnimatedStyle}
                                onSegmentedLayout={handleSegmentedLayout}
                                onComposerModeChange={handleComposerModeChange}
                                onConnectTerminal={connectTerminal}
                                onManualUrl={handleManualUrl}
                                onPickMachine={handlePickMachine}
                                onEditProject={handleEditProjectFromCard}
                                onOpenExpertConfig={handleOpenExpertConfigFromCard}
                            />
                        </Pressable>
                        <Animated.View style={[styles.composerWrap, { paddingBottom: Math.max(12, safeArea.bottom) }, composerAnimatedStyle]}>
                            <PhoneNewSessionComposer
                                inputRef={composerInputRef}
                                isSpawning={isSpawning}
                                sendEnabled={composerSendEnabled}
                                agentInputEnterToSend={agentInputEnterToSend}
                                activityHint={composerActivityHint}
                                attachments={attachments}
                                removeAttachment={removeAttachment}
                                actionTray={composerActionTray}
                                onFocus={handleComposerFocus}
                                onSend={handleComposerSend}
                                onTrailingActionPress={handleComposerTrailingActionPress}
                            />
                        </Animated.View>
                    </View>
                </View>
            </PhoneConversationShell>
            <PhoneCliPickerSheet
                visible={isExpertConfigOpen}
                selectedTool={selectedAgent}
                availableTools={availableAgents}
                initialSection={expertConfigSection}
                showToolSection={false}
                configItems={configItems}
                configSections={configSections}
                onSelectTool={handleSelectCli}
                onClose={closeExpertConfig}
            />
        </View>
    );
});
