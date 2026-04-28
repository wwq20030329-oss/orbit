import * as React from 'react';
import { View, Pressable, Text, ActivityIndicator, Platform } from 'react-native';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from '../haptics';
import { t } from '@/text';
import { Shaker } from '../Shaker';
import { GitStatusBadge, hasRenderableGitStatus } from '../GitStatusBadge';
import { GitStatus } from '@/sync/storageTypes';

interface AgentInputToolbarProps {
    canShowSettings: boolean;
    handleSettingsPress: () => void;
    agentType?: string;
    onAgentClick?: () => void;
    onAbort?: () => void | Promise<void>;
    handleAbortPress: () => void;
    isAborting: boolean;
    shakerRef: any;
    gitStatus?: GitStatus | null;
    onFileViewerPress?: () => void;
    isSendBlocked: boolean;
    hasText: boolean;
    isSending?: boolean;
    onMicPress?: () => void;
    isMicActive?: boolean;
    canPressSendButton: boolean;
    handleSendPress: () => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 0,
    },
    leftActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        overflow: 'hidden',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'center',
        height: 32,
    },
    chipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 10,
        paddingVertical: 6,
        justifyContent: 'center',
        height: 32,
        gap: 6,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    sendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 8,
    },
    sendButtonInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    }
}));

export const AgentInputToolbar = React.memo((props: AgentInputToolbarProps) => {
    const {
        canShowSettings,
        handleSettingsPress,
        agentType,
        onAgentClick,
        onAbort,
        handleAbortPress,
        isAborting,
        shakerRef,
        gitStatus,
        onFileViewerPress,
        isSendBlocked,
        hasText,
        isSending,
        onMicPress,
        isMicActive,
        canPressSendButton,
        handleSendPress,
    } = props;

    const { theme } = useUnistyles();
    const styles = stylesheet;

    return (
        <View style={styles.container}>
            <View style={{ flexDirection: 'column', flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={styles.leftActions}>
                        {canShowSettings && (
                            <Pressable
                                onPress={handleSettingsPress}
                                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    { opacity: pressed ? 0.7 : 1 }
                                ]}
                            >
                                <Octicons name="gear" size={16} color={theme.colors.button.secondary.tint} />
                            </Pressable>
                        )}

                        {agentType && onAgentClick && (
                            <Pressable
                                onPress={() => {
                                    hapticsLight();
                                    onAgentClick();
                                }}
                                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                style={({ pressed }) => [
                                    styles.chipButton,
                                    { opacity: pressed ? 0.7 : 1 }
                                ]}
                            >
                                <Octicons name="cpu" size={14} color={theme.colors.button.secondary.tint} />
                                <Text style={[styles.chipText, { color: theme.colors.button.secondary.tint }]}>
                                    {agentType === 'claude' ? t('agentInput.agent.claude') : agentType === 'codex' ? t('agentInput.agent.codex') : agentType === 'openclaw' ? t('agentInput.agent.openclaw') : t('agentInput.agent.gemini')}
                                </Text>
                            </Pressable>
                        )}

                        {onAbort && (
                            <Shaker ref={shakerRef}>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.actionButton,
                                        { opacity: pressed ? 0.7 : 1 }
                                    ]}
                                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                    onPress={handleAbortPress}
                                    disabled={isAborting}
                                >
                                    {isAborting ? (
                                        <ActivityIndicator size="small" color={theme.colors.button.secondary.tint} />
                                    ) : (
                                        <Octicons name="stop" size={16} color={theme.colors.button.secondary.tint} />
                                    )}
                                </Pressable>
                            </Shaker>
                        )}

                        <GitStatusButton gitStatus={gitStatus} onPress={onFileViewerPress} />
                    </View>

                    <View
                        style={[
                            styles.sendButton,
                            isSendBlocked ? { backgroundColor: theme.colors.surfaceHigh, borderWidth: 1, borderColor: theme.colors.divider } :
                            (hasText || isSending || (onMicPress && !isMicActive))
                                ? { backgroundColor: theme.colors.button.primary.background }
                                : { backgroundColor: theme.colors.button.primary.disabled }
                        ]}
                    >
                        <Pressable
                            style={({ pressed }) => [
                                styles.sendButtonInner,
                                { opacity: pressed ? 0.7 : 1 }
                            ]}
                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                            onPress={handleSendPress}
                            disabled={!canPressSendButton}
                        >
                            {isSending ? (
                                <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                            ) : isSendBlocked ? (
                                <Ionicons name="lock-closed" size={15} color={theme.colors.textSecondary} />
                            ) : hasText ? (
                                <Octicons
                                    name="arrow-up"
                                    size={16}
                                    color={theme.colors.button.primary.tint}
                                    style={{ marginTop: 0 }}
                                />
                            ) : onMicPress && !isMicActive ? (
                                <Image
                                    source={require('@/assets/images/icon-voice-white.png')}
                                    style={{ width: 24, height: 24 }}
                                    tintColor={theme.colors.button.primary.tint}
                                />
                            ) : (
                                <Octicons
                                    name="arrow-up"
                                    size={16}
                                    color={theme.colors.button.primary.tint}
                                    style={{ marginTop: 0 }}
                                />
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </View>
    );
});

// Helper component for Git status
function GitStatusButton({ gitStatus, onPress }: { gitStatus?: GitStatus | null, onPress?: () => void }) {
    const { theme } = useUnistyles();
    const hasMeaningfulGitStatus = hasRenderableGitStatus(gitStatus);

    if (!onPress) {
        return null;
    }

    return (
        <Pressable
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: Platform.select({ default: 16, android: 20 }),
                paddingHorizontal: 8,
                paddingVertical: 6,
                height: 32,
                opacity: pressed ? 0.7 : 1,
                flex: 1,
                overflow: 'hidden',
                backgroundColor: pressed ? theme.colors.surfacePressedOverlay : 'transparent'
            })}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            onPress={() => {
                hapticsLight();
                onPress?.();
            }}
        >
            {hasMeaningfulGitStatus ? (
                <GitStatusBadge gitStatus={gitStatus!} />
            ) : (
                <Octicons
                    name="git-branch"
                    size={16}
                    color={theme.colors.button.secondary.tint}
                />
            )}
        </Pressable>
    );
}
