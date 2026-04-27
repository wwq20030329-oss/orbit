import * as React from 'react';
import {
    Animated,
    Easing,
    InteractionManager,
    Pressable,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

export interface PhoneComposerSettingsItem {
    key: 'model' | 'effort' | 'permission';
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
}

const stylesheet = StyleSheet.create((theme) => ({
    root: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 118,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.14)',
    },
    sheetWrap: {
        paddingHorizontal: 16,
    },
    sheet: {
        borderRadius: 24,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    header: {
        minHeight: 52,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    headerSide: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    options: {
        padding: 10,
        gap: 8,
    },
    optionRow: {
        minHeight: 58,
        borderRadius: 16,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: theme.colors.groupped.background,
    },
    optionTextWrap: {
        flex: 1,
        gap: 2,
    },
    optionLabel: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    optionValue: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    placeholderRow: {
        minHeight: 58,
        borderRadius: 16,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: theme.colors.groupped.background,
    },
    placeholderIcon: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surfaceHigh,
    },
    placeholderTextWrap: {
        flex: 1,
        gap: 7,
    },
    placeholderLine: {
        height: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceHigh,
    },
    placeholderChevron: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surfaceHigh,
    },
}));

export function buildPhoneComposerSettingsSkeletonPlan(itemCount: number) {
    return {
        rowCount: Math.max(1, itemCount),
        minHeight: Math.max(132, itemCount * 66),
    } as const;
}

export function shouldDeferPhoneComposerSettingsContent(hasWarmContent: boolean) {
    return !hasWarmContent;
}

function PhoneComposerSettingsSkeleton({ rowCount }: { rowCount: number }) {
    const styles = stylesheet;
    return (
        <>
            {Array.from({ length: rowCount }).map((_, index) => (
                <View key={`placeholder-${index}`} style={styles.placeholderRow}>
                    <View style={styles.placeholderIcon} />
                    <View style={styles.placeholderTextWrap}>
                        <View style={[styles.placeholderLine, { width: index % 2 === 0 ? '56%' : '68%' }]} />
                        <View style={[styles.placeholderLine, { width: '34%', height: 10 }]} />
                    </View>
                    <View style={styles.placeholderChevron} />
                </View>
            ))}
        </>
    );
}

export const PhoneComposerSettingsSheet = React.memo((props: {
    visible: boolean;
    title: string;
    items: PhoneComposerSettingsItem[];
    bottomOffset?: number;
    onSelect: (key: PhoneComposerSettingsItem['key']) => void;
    onClose: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const [mounted, setMounted] = React.useState(props.visible);
    const [contentReady, setContentReady] = React.useState(false);
    const openInteractionRef = React.useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const hasWarmContentRef = React.useRef(false);
    const backdropOpacity = React.useRef(new Animated.Value(0)).current;
    const translateY = React.useRef(new Animated.Value(28)).current;
    const sheetOpacity = React.useRef(new Animated.Value(0)).current;
    const previousVisibleRef = React.useRef(false);
    const skeletonPlan = React.useMemo(
        () => buildPhoneComposerSettingsSkeletonPlan(props.items.length),
        [props.items.length],
    );

    React.useEffect(() => {
        const wasVisible = previousVisibleRef.current;
        previousVisibleRef.current = props.visible;

        if (props.visible) {
            if (wasVisible) {
                return;
            }

            setMounted(true);
            const shouldDeferContent = shouldDeferPhoneComposerSettingsContent(hasWarmContentRef.current);
            setContentReady(!shouldDeferContent);
            openInteractionRef.current?.cancel();
            openInteractionRef.current = null;
            if (shouldDeferContent) {
                openInteractionRef.current = InteractionManager.runAfterInteractions(() => {
                    openInteractionRef.current = null;
                    hasWarmContentRef.current = true;
                    React.startTransition(() => {
                        setContentReady(true);
                    });
                });
            }
            backdropOpacity.stopAnimation();
            translateY.stopAnimation();
            sheetOpacity.stopAnimation();
            backdropOpacity.setValue(0);
            translateY.setValue(28);
            sheetOpacity.setValue(0);
            Animated.parallel([
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 180,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(sheetOpacity, {
                    toValue: 1,
                    duration: 180,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    damping: 20,
                    stiffness: 220,
                    mass: 0.9,
                    useNativeDriver: true,
                }),
            ]).start(({ finished }) => {
                if (finished) {
                    hasWarmContentRef.current = true;
                }
            });
            return () => {
                openInteractionRef.current?.cancel();
                openInteractionRef.current = null;
            };
        }

        if (!wasVisible) {
            return;
        }

        openInteractionRef.current?.cancel();
        openInteractionRef.current = null;
        backdropOpacity.stopAnimation();
        translateY.stopAnimation();
        sheetOpacity.stopAnimation();
        Animated.parallel([
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 140,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(sheetOpacity, {
                toValue: 0,
                duration: 120,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 20,
                duration: 140,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (finished) {
                setMounted(false);
            }
        });
    }, [backdropOpacity, props.visible, sheetOpacity, translateY]);

    if (!mounted) {
        return null;
    }

    return (
        <View pointerEvents="box-none" style={styles.root}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
            <Pressable style={styles.backdrop} onPress={props.onClose} />
            <Animated.View
                style={[
                    styles.sheetWrap,
                    {
                        marginBottom: props.bottomOffset ?? 16,
                        opacity: sheetOpacity,
                        transform: [{ translateY }],
                    },
                ]}
            >
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View style={styles.headerSide} />
                        <Text style={styles.headerTitle}>{props.title}</Text>
                        <Pressable style={styles.headerSide} onPress={props.onClose}>
                            <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    <View style={styles.options}>
                        {contentReady ? props.items.map((item) => (
                            <Pressable
                                key={item.key}
                                style={({ pressed }) => [
                                    styles.optionRow,
                                    pressed && { opacity: 0.82 },
                                ]}
                                onPress={() => props.onSelect(item.key)}
                            >
                                <Ionicons name={item.icon} size={18} color={theme.colors.textSecondary} />
                                <View style={styles.optionTextWrap}>
                                    <Text style={styles.optionLabel}>{item.label}</Text>
                                    <Text style={styles.optionValue}>{item.value}</Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={18}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                        )) : (
                            <View style={{ minHeight: skeletonPlan.minHeight }}>
                                <PhoneComposerSettingsSkeleton rowCount={skeletonPlan.rowCount} />
                            </View>
                        )}
                    </View>
                </View>
            </Animated.View>
        </View>
    );
});
