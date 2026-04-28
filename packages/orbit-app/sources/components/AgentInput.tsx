import * as React from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { layout } from './layout';
import { MultiTextInput, KeyPressEvent, TextInputState, MultiTextInputHandle } from './MultiTextInput';
import { hapticsLight, hapticsError } from './haptics';
import { Shaker, ShakeInstance } from './Shaker';
import { useActiveWord } from './autocomplete/useActiveWord';
import { useActiveSuggestions } from './autocomplete/useActiveSuggestions';
import { AgentInputAutocomplete } from './AgentInputAutocomplete';
import { applySuggestion } from './autocomplete/applySuggestion';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSetting } from '@/sync/storage';
import { hackMode, hackModes } from '@/sync/modeHacks';
import { t } from '@/text';
import { AgentInputProps } from './AgentInput/types'; 
import { AgentInputStatus } from './AgentInput/AgentInputStatus';
import { AgentInputContextChips } from './AgentInput/AgentInputContextChips';
import { AgentInputSettingsOverlay } from './AgentInput/AgentInputSettingsOverlay';
import { AgentInputToolbar } from './AgentInput/AgentInputToolbar';

const MAX_CONTEXT_SIZE = 190000;
const EMPTY_AVAILABLE_MODELS: any[] = [];
const EMPTY_AVAILABLE_EFFORT_LEVELS: any[] = [];

const getContextWarning = (contextSize: number, alwaysShow: boolean = false, theme: any) => {
    const percentageUsed = (contextSize / MAX_CONTEXT_SIZE) * 100;
    const percentageRemaining = Math.max(0, Math.min(100, 100 - percentageUsed));

    if (percentageRemaining <= 5) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warningCritical };
    } else if (percentageRemaining <= 10) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    } else if (alwaysShow) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    }
    return null;
};

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        alignItems: 'center',
        paddingBottom: 8,
        paddingTop: 8,
    },
    innerContainer: {
        width: '100%',
        position: 'relative',
    },
    unifiedPanel: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'visible', // Changed for glow visibility
        paddingVertical: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 0,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 4,
        minHeight: 40,
    },
    autocompleteOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
}));

type AgentInputBaseProps = AgentInputProps & {
    resolvedEnterToSendEnabled: boolean;
};

const AgentInputBase = React.memo(React.forwardRef<MultiTextInputHandle, AgentInputBaseProps>((props, ref) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const screenWidth = useWindowDimensions().width;
    const horizontalPadding = screenWidth > 700 ? 12 : 8;
    const overlayHorizontalPadding = screenWidth > 700 ? 0 : 8;
    const isSendBlocked = props.blockSend ?? false;

    // Visual Optimization: Focus Glow
    const focusAnim = useSharedValue(0);
    const animatedPanelStyle = useAnimatedStyle(() => {
        return {
            shadowColor: focusAnim.value > 0 ? theme.colors.permission.acceptEdits : 'transparent',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: withTiming(focusAnim.value * 0.3, { duration: 250 }),
            shadowRadius: withTiming(focusAnim.value * 12, { duration: 250 }),
            transform: [{ scale: withTiming(1 + focusAnim.value * 0.005, { duration: 250 }) }],
            borderWidth: 1,
            borderColor: interpolateColor(
                focusAnim.value,
                [0, 1],
                [theme.colors.input.background, theme.colors.permission.acceptEdits + '40']
            )
        };
    });

    const handleFocus = React.useCallback(() => {
        focusAnim.value = withTiming(1);
    }, []);

    const handleBlur = React.useCallback(() => {
        focusAnim.value = withTiming(0);
    }, []);

    // Logic & State
    const hasText = props.value.trim().length > 0;
    const canPressSendButton = !props.isSending && !props.isSendDisabled && (isSendBlocked ? hasText : (hasText || !!props.onMicPress));
    const isCodex = props.metadata?.flavor === 'codex' || props.agentType === 'codex';
    const isGemini = props.metadata?.flavor === 'gemini' || props.agentType === 'gemini';
    const displayPermissionMode = React.useMemo(() => (props.permissionMode ? hackMode(props.permissionMode) : null), [props.permissionMode]);
    const permissionModeKey = displayPermissionMode?.key ?? 'default';
    const availableModes = React.useMemo(() => (hackModes(props.availableModes ?? [])), [props.availableModes]);
    const isSandboxEnabled = Boolean(props.metadata?.sandbox);
    const isSandboxedYoloMode = isSandboxEnabled && (permissionModeKey === 'bypassPermissions' || permissionModeKey === 'yolo');

    const withSandboxSuffix = React.useCallback((label: string, modeKey?: string) => {
        if (!isSandboxEnabled) return label;
        return (modeKey === 'bypassPermissions' || modeKey === 'yolo') ? `${label} (sandboxed)` : label;
    }, [isSandboxEnabled]);

    const contextWarning = props.usageData?.contextSize ? getContextWarning(props.usageData.contextSize, props.alwaysShowContextSize ?? false, theme) : null;
    const [isAborting, setIsAborting] = React.useState(false);
    const shakerRef = React.useRef<ShakeInstance>(null);
    const sendBlockShakerRef = React.useRef<ShakeInstance>(null);
    const inputRef = React.useRef<MultiTextInputHandle>(null);
    React.useImperativeHandle(ref, () => inputRef.current!, []);

    const [inputState, setInputState] = React.useState<TextInputState>({ text: props.value, selection: { start: 0, end: 0 } });
    const deferredInputState = React.useDeferredValue(inputState);
    const activeWord = useActiveWord(deferredInputState.text, deferredInputState.selection, props.autocompletePrefixes);
    const [suggestions, selected, moveUp, moveDown] = useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: true, wrapAround: true });

    const handleSuggestionSelect = React.useCallback((index: number) => {
        if (!suggestions[index] || !inputRef.current) return;
        const result = applySuggestion(inputState.text, inputState.selection, suggestions[index].text, props.autocompletePrefixes, true);
        inputRef.current.setTextAndSelection(result.text, { start: result.cursorPosition, end: result.cursorPosition });
        hapticsLight();
    }, [suggestions, inputState, props.autocompletePrefixes]);

    const [showSettings, setShowSettings] = React.useState(false);
    const handleSettingsPress = React.useCallback(() => { hapticsLight(); setShowSettings(p => !p); }, []);
    const handleAbortPress = React.useCallback(async () => {
        if (!props.onAbort) return;
        hapticsError(); setIsAborting(true);
        try { await props.onAbort?.(); } catch (e) { shakerRef.current?.shake(); } finally { setIsAborting(false); }
    }, [props.onAbort]);

    const handleSendPress = React.useCallback(() => {
        if (isSendBlocked) { hapticsError(); sendBlockShakerRef.current?.shake(); return; }
        if (props.isSendDisabled || props.isSending) return;
        hapticsLight();
        if (hasText) props.onSend(); else props.onMicPress?.();
    }, [hasText, isSendBlocked, props.isSendDisabled, props.isSending, props.onMicPress, props.onSend]);

    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        if (suggestions.length > 0) {
            if (event.key === 'ArrowUp') { moveUp(); return true; }
            if (event.key === 'ArrowDown') { moveDown(); return true; }
            if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) { handleSuggestionSelect(selected >= 0 ? selected : 0); return true; }
            if (event.key === 'Escape') { if (inputRef.current) inputRef.current.setTextAndSelection(inputState.text, inputState.selection); return true; }
        }
        if (event.key === 'Escape' && props.showAbortButton && props.onAbort && !isAborting) { handleAbortPress(); return true; }
        return false;
    }, [suggestions, moveUp, moveDown, handleSuggestionSelect, selected, props.showAbortButton, props.onAbort, isAborting, handleAbortPress, inputState]);

    return (
        <View style={[styles.container, { paddingHorizontal: horizontalPadding }]}>
            <View style={[styles.innerContainer, { maxWidth: layout.maxWidth }]}>
                {suggestions.length > 0 && (
                    <View style={[styles.autocompleteOverlay, { paddingHorizontal: overlayHorizontalPadding }]}>
                        <AgentInputAutocomplete 
                            suggestions={suggestions.map(s => { const C = s.component; return <C key={s.key} />; })} 
                            selectedIndex={selected} onSelect={handleSuggestionSelect} itemHeight={48} 
                        />
                    </View>
                )}

                <AgentInputSettingsOverlay
                    showSettings={showSettings} onDismiss={() => setShowSettings(false)}
                    canShowSettings={Boolean(props.onPermissionModeChange) || (props.availableModels?.length ?? 0) > 0}
                    hasPermissionSettings={Boolean(props.onPermissionModeChange)} isCodex={isCodex} isGemini={isGemini}
                    availableModes={availableModes} permissionModeKey={permissionModeKey}
                    handleSettingsSelect={(m) => { props.onPermissionModeChange?.(m); setShowSettings(false); }}
                    withSandboxSuffix={withSandboxSuffix} hasModelSettings={(props.availableModels?.length ?? 0) > 0}
                    availableModels={props.availableModels ?? []} modelMode={props.modelMode} onModelModeChange={props.onModelModeChange}
                    hasEffortSettings={(props.availableEffortLevels?.length ?? 0) > 0} 
                    availableEffortLevels={props.availableEffortLevels ?? []} effortLevel={props.effortLevel} onEffortLevelChange={props.onEffortLevelChange}
                />

                <AgentInputStatus 
                    connectionStatus={props.connectionStatus} contextWarning={contextWarning}
                    displayPermissionMode={displayPermissionMode} permissionModeKey={permissionModeKey}
                    isSandboxedYoloMode={isSandboxedYoloMode} withSandboxSuffix={withSandboxSuffix}
                />

                <AgentInputContextChips 
                    machineName={props.machineName} onMachineClick={props.onMachineClick}
                    currentPath={props.currentPath} onPathClick={props.onPathClick}
                />

                <Shaker ref={sendBlockShakerRef}>
                    <Animated.View style={[styles.unifiedPanel, animatedPanelStyle]}>
                        <View style={[styles.inputContainer, props.minHeight ? { minHeight: props.minHeight } : undefined]}>
                            <MultiTextInput
                                ref={inputRef} value={props.value} onChangeText={props.onChangeText}
                                placeholder={props.placeholder} onKeyPress={handleKeyPress}
                                onStateChange={setInputState} maxHeight={120}
                                onFocus={handleFocus} onBlur={handleBlur}
                            />
                        </View>

                        <AgentInputToolbar 
                            canShowSettings={Boolean(props.onPermissionModeChange)} handleSettingsPress={handleSettingsPress}
                            agentType={props.agentType} onAgentClick={props.onAgentClick}
                            onAbort={props.onAbort} handleAbortPress={handleAbortPress} isAborting={isAborting} shakerRef={shakerRef}
                            gitStatus={props.gitStatus} onFileViewerPress={props.onFileViewerPress}
                            isSendBlocked={isSendBlocked} hasText={hasText} isSending={props.isSending}
                            onMicPress={props.onMicPress} isMicActive={props.isMicActive}
                            canPressSendButton={canPressSendButton} handleSendPress={handleSendPress}
                        />
                    </Animated.View>
                </Shaker>
            </View>
        </View>
    );
}));

export const AgentInput = React.memo(React.forwardRef<MultiTextInputHandle, AgentInputProps>((props, ref) => {
    const enterToSend = useSetting('agentInputEnterToSend');
    return <AgentInputBase {...props} ref={ref} resolvedEnterToSendEnabled={props.enterToSendEnabled ?? enterToSend} />;
}));
