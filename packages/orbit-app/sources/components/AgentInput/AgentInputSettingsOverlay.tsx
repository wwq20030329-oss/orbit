import * as React from 'react';
import { View, Text, Pressable, TouchableWithoutFeedback } from 'react-native';
import { FloatingOverlay } from '../FloatingOverlay';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from '../haptics';
import { t } from '@/text';
import { PermissionMode, ModelMode } from '../PermissionModeSelector';
import { EffortLevel } from '../modelModeOptions';

interface AgentInputSettingsOverlayProps {
    showSettings: boolean;
    canShowSettings: boolean;
    onDismiss: () => void;
    hasPermissionSettings: boolean;
    isCodex: boolean;
    isGemini: boolean;
    availableModes: PermissionMode[];
    permissionModeKey: string;
    onPermissionModeChange?: (mode: PermissionMode) => void;
    handleSettingsSelect: (mode: PermissionMode) => void;
    withSandboxSuffix: (label: string, modeKey?: string) => string;
    hasModelSettings: boolean;
    availableModels: ModelMode[];
    modelMode?: ModelMode | null;
    onModelModeChange?: (mode: ModelMode) => void;
    hasEffortSettings: boolean;
    availableEffortLevels: EffortLevel[];
    effortLevel?: EffortLevel | null;
    onEffortLevelChange?: (level: EffortLevel) => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    settingsOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    overlayBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 999,
    },
    overlaySection: {
        paddingVertical: 8,
    },
    overlaySectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingBottom: 4,
        ...Typography.default('semiBold'),
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginHorizontal: 16,
    },
    selectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    radio: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    labelContainer: {
        flex: 1,
    },
    primaryText: {
        fontSize: 14,
        ...Typography.default(),
    },
    secondaryText: {
        fontSize: 11,
        ...Typography.default(),
    },
}));

export const AgentInputSettingsOverlay = React.memo((props: AgentInputSettingsOverlayProps) => {
    const {
        showSettings,
        canShowSettings,
        onDismiss,
        hasPermissionSettings,
        isCodex,
        isGemini,
        availableModes,
        permissionModeKey,
        handleSettingsSelect,
        withSandboxSuffix,
        hasModelSettings,
        availableModels,
        modelMode,
        onModelModeChange,
        hasEffortSettings,
        availableEffortLevels,
        effortLevel,
        onEffortLevelChange,
    } = props;

    const { theme } = useUnistyles();
    const styles = stylesheet;

    if (!showSettings || !canShowSettings) return null;

    return (
        <>
            <TouchableWithoutFeedback onPress={onDismiss}>
                <View style={styles.overlayBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.settingsOverlay}>
                <FloatingOverlay maxHeight={400} keyboardShouldPersistTaps="always">
                    {hasPermissionSettings && (
                        <View style={styles.overlaySection}>
                            <Text style={styles.overlaySectionTitle}>
                                {isCodex ? t('agentInput.codexPermissionMode.title') : isGemini ? t('agentInput.geminiPermissionMode.title') : t('agentInput.permissionMode.title')}
                            </Text>
                            {availableModes.map((mode) => {
                                const isSelected = permissionModeKey === mode.key;
                                return (
                                    <Pressable
                                        key={mode.key}
                                        onPress={() => handleSettingsSelect(mode)}
                                        style={({ pressed }) => [
                                            styles.selectionItem,
                                            { backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' }
                                        ]}
                                    >
                                        <View style={[
                                            styles.radio,
                                            { borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive }
                                        ]}>
                                            {isSelected && (
                                                <View style={[styles.radioDot, { backgroundColor: theme.colors.radio.dot }]} />
                                            )}
                                        </View>
                                        <View style={styles.labelContainer}>
                                            <Text style={[
                                                styles.primaryText,
                                                { color: isSelected ? theme.colors.radio.active : theme.colors.text }
                                            ]}>
                                                {withSandboxSuffix(mode.name, mode.key)}
                                            </Text>
                                            {!!mode.description && (
                                                <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>
                                                    {mode.description}
                                                </Text>
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    {hasPermissionSettings && (hasModelSettings || hasEffortSettings) && (
                        <View style={styles.divider} />
                    )}

                    {hasModelSettings && (
                        <View style={styles.overlaySection}>
                            <Text style={styles.overlaySectionTitle}>
                                {t('agentInput.model.title')}
                            </Text>
                            {availableModels.map((model) => {
                                const isSelected = modelMode?.key === model.key;
                                return (
                                    <Pressable
                                        key={model.key}
                                        onPress={() => {
                                            hapticsLight();
                                            onModelModeChange?.(model);
                                            onDismiss();
                                        }}
                                        style={({ pressed }) => [
                                            styles.selectionItem,
                                            { backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' }
                                        ]}
                                    >
                                        <View style={[
                                            styles.radio,
                                            { borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive }
                                        ]}>
                                            {isSelected && (
                                                <View style={[styles.radioDot, { backgroundColor: theme.colors.radio.dot }]} />
                                            )}
                                        </View>
                                        <View>
                                            <Text style={[
                                                styles.primaryText,
                                                { color: isSelected ? theme.colors.radio.active : theme.colors.text }
                                            ]}>
                                                {model.name}
                                            </Text>
                                            {!!model.description && (
                                                <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>
                                                    {model.description}
                                                </Text>
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

                    {(hasPermissionSettings || hasModelSettings) && hasEffortSettings && (
                        <View style={styles.divider} />
                    )}

                    {hasEffortSettings && (
                        <View style={styles.overlaySection}>
                            <Text style={styles.overlaySectionTitle}>
                                {t('agentInput.effort.title')}
                            </Text>
                            {availableEffortLevels.map((level) => {
                                const isSelected = effortLevel?.key === level.key;
                                return (
                                    <Pressable
                                        key={level.key}
                                        onPress={() => {
                                            hapticsLight();
                                            onEffortLevelChange?.(level);
                                            onDismiss();
                                        }}
                                        style={({ pressed }) => [
                                            styles.selectionItem,
                                            { backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' }
                                        ]}
                                    >
                                        <View style={[
                                            styles.radio,
                                            { borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive }
                                        ]}>
                                            {isSelected && (
                                                <View style={[styles.radioDot, { backgroundColor: theme.colors.radio.dot }]} />
                                            )}
                                        </View>
                                        <View>
                                            <Text style={[
                                                styles.primaryText,
                                                { color: isSelected ? theme.colors.radio.active : theme.colors.text }
                                            ]}>
                                                {level.name}
                                            </Text>
                                            {!!level.description && (
                                                <Text style={[styles.secondaryText, { color: theme.colors.textSecondary }]}>
                                                    {level.description}
                                                </Text>
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </FloatingOverlay>
            </View>
        </>
    );
});
