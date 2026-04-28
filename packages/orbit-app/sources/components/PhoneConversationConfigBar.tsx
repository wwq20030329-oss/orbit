import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';

export interface PhoneConversationConfigItem {
    key: string;
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
}

function areConfigItemsEqual(
    left: PhoneConversationConfigItem[],
    right: PhoneConversationConfigItem[],
): boolean {
    if (left === right) {
        return true;
    }
    if (left.length !== right.length) {
        return false;
    }

    return left.every((item, index) => {
        const nextItem = right[index];
        return item.key === nextItem.key
            && item.label === nextItem.label
            && item.value === nextItem.value
            && item.icon === nextItem.icon
            && item.onPress === nextItem.onPress;
    });
}

const stylesheet = StyleSheet.create((theme) => ({
    wrap: {
        marginBottom: 12,
    },
    scrollContent: {
        paddingHorizontal: 2,
        gap: 8,
    },
    item: {
        minHeight: 34,
        borderRadius: 999,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    itemLabel: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    itemValue: {
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
}));

const PhoneConversationConfigChip = React.memo((props: {
    item: PhoneConversationConfigItem;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();

    return (
        <Pressable
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.78 }]}
            onPress={props.item.onPress}
        >
            <Ionicons name={props.item.icon} size={14} color={theme.colors.textSecondary} />
            <Text style={styles.itemLabel}>{props.item.label}</Text>
            <Text numberOfLines={1} style={styles.itemValue}>
                {props.item.value}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
        </Pressable>
    );
}, (prev, next) => (
    prev.item.key === next.item.key
    && prev.item.label === next.item.label
    && prev.item.value === next.item.value
    && prev.item.icon === next.item.icon
    && prev.item.onPress === next.item.onPress
));

export const PhoneConversationConfigBar = React.memo((props: {
    items: PhoneConversationConfigItem[];
}) => {
    const styles = stylesheet;

    if (props.items.length === 0) {
        return null;
    }

    return (
        <View style={styles.wrap}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
            >
                {props.items.map((item) => (
                    <PhoneConversationConfigChip key={item.key} item={item} />
                ))}
            </ScrollView>
        </View>
    );
}, (prev, next) => areConfigItemsEqual(prev.items, next.items));
