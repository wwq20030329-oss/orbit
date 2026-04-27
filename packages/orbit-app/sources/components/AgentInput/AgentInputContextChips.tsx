import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from '../haptics';
import { t } from '@/text';

interface AgentInputContextChipsProps {
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfacePressed,
        borderRadius: 12,
        padding: 8,
        marginBottom: 8,
        gap: 4,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 10,
        paddingVertical: 6,
        height: 32,
        gap: 6,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
}));

export const AgentInputContextChips = React.memo((props: AgentInputContextChipsProps) => {
    const { machineName, onMachineClick, currentPath, onPathClick } = props;
    const { theme } = useUnistyles();
    const styles = stylesheet;

    if (machineName === undefined && !currentPath) {
        return null;
    }

    return (
        <View style={styles.container}>
            {machineName !== undefined && onMachineClick && (
                <Pressable
                    onPress={() => {
                        hapticsLight();
                        onMachineClick();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={({ pressed }) => [
                        styles.chip,
                        { 
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: pressed ? theme.colors.surfacePressedOverlay : 'transparent'
                        }
                    ]}
                >
                    <Ionicons
                        name="desktop-outline"
                        size={14}
                        color={theme.colors.textSecondary}
                    />
                    <Text style={[styles.chipText, { color: theme.colors.text }]}>
                        {machineName === null ? t('agentInput.noMachinesAvailable') : machineName}
                    </Text>
                </Pressable>
            )}

            {currentPath && onPathClick && (
                <Pressable
                    onPress={() => {
                        hapticsLight();
                        onPathClick();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={({ pressed }) => [
                        styles.chip,
                        { 
                            opacity: pressed ? 0.7 : 1,
                            backgroundColor: pressed ? theme.colors.surfacePressedOverlay : 'transparent'
                        }
                    ]}
                >
                    <Ionicons
                        name="folder-outline"
                        size={14}
                        color={theme.colors.textSecondary}
                    />
                    <Text style={[styles.chipText, { color: theme.colors.text }]}>
                        {currentPath}
                    </Text>
                </Pressable>
            )}
        </View>
    );
});
