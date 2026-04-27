import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { BottomSheet } from '@/components/motion/BottomSheet';
import { DURATION } from '@/components/motion/tokens';

export interface PhoneOptionPickerItem {
    key: string;
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
}

const stylesheet = StyleSheet.create((theme) => ({
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
        minHeight: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        backgroundColor: theme.colors.groupped.background,
    },
    optionRowActive: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    optionLabel: {
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    optionIconWrap: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

export const PhoneOptionPickerSheet = React.memo((props: {
    visible: boolean;
    title: string;
    options: PhoneOptionPickerItem[];
    selectedKey?: string | null;
    bottomOffset?: number;
    onSelect: (key: string) => void;
    onClose: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    return (
        <BottomSheet
            visible={props.visible}
            onClose={props.onClose}
            bottomOffset={props.bottomOffset}
        >
            <View style={styles.header}>
                <View style={styles.headerSide} />
                <Text style={styles.headerTitle}>{props.title}</Text>
                <Pressable style={styles.headerSide} onPress={props.onClose}>
                    <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
            <View style={styles.options}>
                {props.options.map((option, idx) => {
                    const active = option.key === props.selectedKey;
                    return (
                        <Animated.View
                            key={option.key}
                            entering={FadeIn.duration(DURATION.short).delay(idx * 25)}
                        >
                            <Pressable
                                style={({ pressed }) => [
                                    styles.optionRow,
                                    active && styles.optionRowActive,
                                    pressed && { opacity: 0.82, transform: [{ scale: 0.98 }] },
                                ]}
                                onPress={() => {
                                    props.onSelect(option.key);
                                    props.onClose();
                                }}
                            >
                                {option.icon ? (
                                    <View style={styles.optionIconWrap}>
                                        <Ionicons name={option.icon} size={18} color={theme.colors.textSecondary} />
                                    </View>
                                ) : null}
                                <Text style={styles.optionLabel}>{option.label}</Text>
                                {active ? (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={20}
                                        color={theme.colors.button.primary.background}
                                    />
                                ) : (
                                    <Ionicons
                                        name="chevron-forward"
                                        size={18}
                                        color={theme.colors.textSecondary}
                                    />
                                )}
                            </Pressable>
                        </Animated.View>
                    );
                })}
            </View>
        </BottomSheet>
    );
});
