import * as React from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import {
    MultiTextInput,
    MULTI_TEXT_INPUT_LINE_HEIGHT,
    type KeyPressEvent,
    type MultiTextInputHandle,
} from '@/components/MultiTextInput';
import { Typography } from '@/constants/Typography';

const COMPOSER_INPUT_VERTICAL_PADDING = 8;
const COMPOSER_SEND_BUTTON_SIZE = 34;

export interface PhoneComposerChip {
    key: string;
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
    trailingIcon?: keyof typeof Ionicons.glyphMap;
}

interface PhoneComposerFooterAction {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    trailingIcon?: keyof typeof Ionicons.glyphMap;
}

interface PhoneComposerActionTrayItem {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
}

interface PhoneMessageComposerCardProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    onSend: () => void;
    canSend: boolean;
    isSending?: boolean;
    showAbortButton?: boolean;
    onAbort?: () => void | Promise<void>;
    chips?: PhoneComposerChip[];
    footerAction?: PhoneComposerFooterAction | null;
    trailingActionIcon?: keyof typeof Ionicons.glyphMap;
    onTrailingActionPress?: () => void;
    onKeyPress?: (event: KeyPressEvent) => boolean;
    onFocus?: () => void;
    onBlur?: () => void;
    inputRef?: React.RefObject<MultiTextInputHandle | null>;
    actionTray?: {
        visible: boolean;
        items: PhoneComposerActionTrayItem[];
    } | null;
    activityHint?: {
        key: string;
        text: string;
        kind?: 'info' | 'thinking';
        icon?: keyof typeof Ionicons.glyphMap;
    } | null;
}

function areComposerChipsEqual(
    left: PhoneComposerChip[] | undefined,
    right: PhoneComposerChip[] | undefined,
): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }

    return left.every((chip, index) => {
        const nextChip = right[index];
        return chip.key === nextChip.key
            && chip.label === nextChip.label
            && chip.icon === nextChip.icon
            && chip.trailingIcon === nextChip.trailingIcon
            && chip.onPress === nextChip.onPress;
    });
}

function areComposerActionTrayItemsEqual(
    left: PhoneComposerActionTrayItem[] | undefined,
    right: PhoneComposerActionTrayItem[] | undefined,
): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }

    return left.every((item, index) => {
        const nextItem = right[index];
        return item.key === nextItem.key
            && item.label === nextItem.label
            && item.icon === nextItem.icon
            && item.onPress === nextItem.onPress;
    });
}

function areComposerCardsEqual(
    prev: PhoneMessageComposerCardProps,
    next: PhoneMessageComposerCardProps,
): boolean {
    return prev.value === next.value
        && prev.placeholder === next.placeholder
        && prev.canSend === next.canSend
        && prev.isSending === next.isSending
        && prev.showAbortButton === next.showAbortButton
        && prev.onSend === next.onSend
        && prev.onAbort === next.onAbort
        && prev.onChangeText === next.onChangeText
        && prev.onKeyPress === next.onKeyPress
        && prev.onFocus === next.onFocus
        && prev.onBlur === next.onBlur
        && prev.inputRef === next.inputRef
        && prev.onTrailingActionPress === next.onTrailingActionPress
        && prev.trailingActionIcon === next.trailingActionIcon
        && prev.footerAction?.label === next.footerAction?.label
        && prev.footerAction?.icon === next.footerAction?.icon
        && prev.footerAction?.trailingIcon === next.footerAction?.trailingIcon
        && prev.footerAction?.onPress === next.footerAction?.onPress
        && prev.activityHint?.key === next.activityHint?.key
        && prev.activityHint?.text === next.activityHint?.text
        && prev.activityHint?.kind === next.activityHint?.kind
        && prev.activityHint?.icon === next.activityHint?.icon
        && prev.actionTray?.visible === next.actionTray?.visible
        && areComposerActionTrayItemsEqual(prev.actionTray?.items, next.actionTray?.items)
        && areComposerChipsEqual(prev.chips, next.chips);
}

const stylesheet = StyleSheet.create((theme) => ({
    composerCard: {
        borderRadius: 24,
        paddingTop: 14,
        paddingBottom: 12,
        paddingHorizontal: 14,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: -4 },
            },
            android: {
                elevation: 8,
            },
            default: {},
        }),
    },
    hintWrap: {
        marginBottom: 10,
        alignItems: 'center',
    },
    hintBadge: {
        minHeight: 28,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    hintText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    composerInputRow: {
        width: '100%',
    },
    inputField: {
        minHeight: 52,
        justifyContent: 'center',
    },
    sendButton: {
        width: COMPOSER_SEND_BUTTON_SIZE,
        height: COMPOSER_SEND_BUTTON_SIZE,
        borderRadius: COMPOSER_SEND_BUTTON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    composerFooter: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    composerFooterCompact: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    chipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
        flexWrap: 'wrap',
    },
    footerActionButton: {
        minHeight: 32,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    chip: {
        minHeight: 32,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    chipText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    chipChevron: {
        marginLeft: -2,
    },
    composerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 'auto',
    },
    secondaryActionButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
    },
    actionTray: {
        marginTop: 12,
        flexDirection: 'row',
        gap: 10,
    },
    actionTrayButton: {
        flex: 1,
        minHeight: 72,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
            },
            android: {
                elevation: 4,
            },
            default: {},
        }),
    },
    actionTrayLabel: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
}));

export const PhoneMessageComposerCard = React.memo((props: PhoneMessageComposerCardProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const hintOpacity = React.useRef(new Animated.Value(props.activityHint ? 1 : 0)).current;
    const hintTranslateY = React.useRef(new Animated.Value(props.activityHint ? 0 : 6)).current;
    const hasLeadingFooterContent = Boolean(props.footerAction || props.chips?.length);
    const [isAborting, setIsAborting] = React.useState(false);

    const handlePrimaryAction = React.useCallback(async () => {
        if (props.showAbortButton) {
            if (!props.onAbort || isAborting) {
                return;
            }
            setIsAborting(true);
            try {
                await props.onAbort();
            } finally {
                setIsAborting(false);
            }
            return;
        }

        if (!props.canSend) {
            return;
        }

        props.onSend();
    }, [isAborting, props]);

    React.useEffect(() => {
        if (!props.activityHint) {
            Animated.parallel([
                Animated.timing(hintOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
                Animated.timing(hintTranslateY, { toValue: 6, duration: 140, useNativeDriver: true }),
            ]).start();
            return;
        }

        hintOpacity.setValue(0);
        hintTranslateY.setValue(6);
        Animated.parallel([
            Animated.timing(hintOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.spring(hintTranslateY, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: true }),
        ]).start();
    }, [hintOpacity, hintTranslateY, props.activityHint?.key]);

    return (
        <>
            {props.activityHint && (
                <Animated.View
                    style={[
                        styles.hintWrap,
                        {
                            opacity: hintOpacity,
                            transform: [{ translateY: hintTranslateY }],
                        },
                    ]}
                >
                    <View style={styles.hintBadge}>
                        {props.activityHint.kind === 'thinking' ? (
                            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        ) : (
                            <Ionicons
                                name={props.activityHint.icon ?? 'sparkles-outline'}
                                size={14}
                                color={theme.colors.textSecondary}
                            />
                        )}
                        <Text style={styles.hintText}>{props.activityHint.text}</Text>
                    </View>
                </Animated.View>
            )}
            <View style={styles.composerCard}>
                <View style={styles.composerInputRow}>
                    <View style={styles.inputField}>
                        <MultiTextInput
                            ref={props.inputRef}
                            value={props.value}
                            onChangeText={props.onChangeText}
                            placeholder={props.placeholder}
                            lineHeight={MULTI_TEXT_INPUT_LINE_HEIGHT}
                            paddingTop={COMPOSER_INPUT_VERTICAL_PADDING}
                            paddingBottom={COMPOSER_INPUT_VERTICAL_PADDING}
                            maxHeight={220}
                            onKeyPress={props.onKeyPress}
                            onFocus={props.onFocus}
                            onBlur={props.onBlur}
                        />
                    </View>
                </View>

                <View
                    style={[
                        styles.composerFooter,
                        !hasLeadingFooterContent && styles.composerFooterCompact,
                        hasLeadingFooterContent && !(props.onTrailingActionPress && props.trailingActionIcon) && { justifyContent: 'flex-start' },
                    ]}
                >
                        {hasLeadingFooterContent ? (
                            <View style={styles.chipsRow}>
                                {props.footerAction ? (
                                    <Pressable style={styles.footerActionButton} onPress={props.footerAction.onPress}>
                                        {props.footerAction.icon ? (
                                            <Ionicons
                                                name={props.footerAction.icon}
                                                size={14}
                                                color={theme.colors.textSecondary}
                                            />
                                        ) : null}
                                        <Text style={styles.chipText}>{props.footerAction.label}</Text>
                                        {(props.footerAction.trailingIcon ?? 'chevron-down') ? (
                                            <Ionicons
                                                name={props.footerAction.trailingIcon ?? 'chevron-down'}
                                                size={14}
                                                color={theme.colors.textSecondary}
                                                style={styles.chipChevron}
                                            />
                                        ) : null}
                                    </Pressable>
                                ) : null}
                                {props.chips?.map((chip) => (
                                    <Pressable
                                        key={chip.key}
                                        style={styles.chip}
                                        onPress={chip.onPress}
                                        disabled={!chip.onPress}
                                    >
                                        {chip.icon && (
                                            <Ionicons name={chip.icon} size={14} color={theme.colors.textSecondary} />
                                        )}
                                        <Text style={styles.chipText}>{chip.label}</Text>
                                        {chip.onPress && (
                                            <Ionicons
                                                name={chip.trailingIcon ?? 'chevron-down'}
                                                size={14}
                                                color={theme.colors.textSecondary}
                                                style={styles.chipChevron}
                                            />
                                        )}
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}

                        <View style={styles.composerActions}>
                            {props.onTrailingActionPress && props.trailingActionIcon ? (
                                <Pressable style={styles.secondaryActionButton} onPress={props.onTrailingActionPress}>
                                    <Ionicons name={props.trailingActionIcon} size={18} color={theme.colors.textSecondary} />
                                </Pressable>
                            ) : null}

                            <Pressable
                                style={[
                                    styles.sendButton,
                                    (props.showAbortButton || props.canSend) ? styles.sendButtonActive : styles.sendButtonInactive,
                                ]}
                                disabled={props.showAbortButton ? !props.onAbort || isAborting : !props.canSend}
                                onPress={() => { void handlePrimaryAction(); }}
                            >
                                {props.showAbortButton ? (
                                    isAborting ? (
                                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                    ) : (
                                        <Ionicons
                                            name="stop"
                                            size={16}
                                            color={theme.colors.button.primary.tint}
                                        />
                                    )
                                ) : props.isSending ? (
                                    <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                ) : (
                                    <Ionicons
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
            {props.actionTray?.visible ? (
                <View style={styles.actionTray}>
                    {props.actionTray.items.map((item) => (
                        <Pressable
                            key={item.key}
                            style={({ pressed }) => [
                                styles.actionTrayButton,
                                pressed && { opacity: 0.82 },
                            ]}
                            onPress={item.onPress}
                        >
                            <Ionicons name={item.icon} size={20} color={theme.colors.textSecondary} />
                            <Text style={styles.actionTrayLabel}>{item.label}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : null}
        </>
    );
}, areComposerCardsEqual);
