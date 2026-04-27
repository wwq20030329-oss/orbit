import * as React from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/StyledText';
import {
    PhoneCliPickerSheet,
    type PhoneCliPickerConfigItem,
    type PhoneCliPickerConfigSection,
} from '@/components/PhoneCliPickerSheet';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import type { PhoneCliTool } from '@/utils/phoneCli';
import { getPhoneCliIcon, getPhoneCliLabel, PHONE_CLI_TOOL_ORDER } from '@/utils/phoneCli';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    content: {
        flex: 1,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 16,
    },
    header: {
        minHeight: 56,
        position: 'relative',
        zIndex: 5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    headerTitle: {
        textAlign: 'center',
        fontSize: 17,
        color: theme.colors.text,
        maxWidth: 220,
        ...Typography.default('semiBold'),
    },
    cliSelector: {
        minHeight: 40,
        minWidth: 124,
        maxWidth: 220,
        borderRadius: 20,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    cliSelectorText: {
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    body: {
        flex: 1,
    },
}));

interface PhoneConversationShellProps {
    title?: string;
    children: React.ReactNode;
    leadingIcon?: 'menu' | 'back';
    onLeadingPress?: () => void;
    onTrailingPress?: () => void;
    trailingIcon?: keyof typeof Ionicons.glyphMap;
    currentCli?: PhoneCliTool;
    availableCliTools?: readonly PhoneCliTool[];
    onSelectCurrentCli?: (tool: PhoneCliTool) => void;
    configItems?: PhoneCliPickerConfigItem[];
    configSections?: PhoneCliPickerConfigSection[];
}

export const PhoneConversationShell = React.memo((props: PhoneConversationShellProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const navigation = useNavigation();
    const router = useRouter();
    const [isCliPickerOpen, setIsCliPickerOpen] = React.useState(false);

    const leadingIcon = props.leadingIcon ?? 'menu';
    const trailingIcon = props.trailingIcon ?? 'add-circle-outline';

    const handleLeadingPress = React.useCallback(() => {
        Keyboard.dismiss();
        if (props.onLeadingPress) {
            props.onLeadingPress();
            return;
        }

        if (leadingIcon === 'menu') {
            navigation.dispatch(DrawerActions.openDrawer());
            return;
        }

        if (navigation.canGoBack()) {
            router.back();
            return;
        }

        navigation.dispatch(DrawerActions.openDrawer());
    }, [leadingIcon, navigation, props, router]);

    const handleTrailingPress = React.useCallback(() => {
        Keyboard.dismiss();
        if (props.onTrailingPress) {
            props.onTrailingPress();
            return;
        }

        router.navigate('/');
    }, [props, router]);

    const availableCliTools = React.useMemo(() => {
        if (!props.currentCli) {
            return [];
        }
        const tools = props.availableCliTools ?? PHONE_CLI_TOOL_ORDER;
        return tools.filter((tool, index, array) => array.indexOf(tool) === index);
    }, [props.availableCliTools, props.currentCli]);
    const canSelectCli = Boolean(props.onSelectCurrentCli && availableCliTools.length > 1);
    const canOpenConfigSections = Boolean(props.configSections && props.configSections.length > 0);
    const canOpenPicker = Boolean(props.currentCli && (canSelectCli || canOpenConfigSections));
    const openCliPicker = React.useCallback(() => {
        Keyboard.dismiss();
        setIsCliPickerOpen(true);
    }, []);
    const handlePickerClose = React.useCallback(() => {
        setIsCliPickerOpen(false);
    }, []);
    const handleSelectTool = React.useCallback((tool: PhoneCliTool) => {
        props.onSelectCurrentCli?.(tool);
    }, [props.onSelectCurrentCli]);

    return (
        <View style={styles.container}>
            <View style={[styles.content, { paddingTop: safeArea.top + 6 }]}>
                <View style={styles.header}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.headerButton,
                            pressed && { opacity: 0.72 },
                        ]}
                        onPress={handleLeadingPress}
                    >
                        <Ionicons
                            name={leadingIcon === 'menu'
                                ? 'menu-outline'
                                : Platform.OS === 'ios'
                                    ? 'chevron-back'
                                    : 'arrow-back'}
                            size={leadingIcon === 'menu' ? 22 : Platform.select({ ios: 24, default: 22 })}
                            color={theme.colors.text}
                        />
                    </Pressable>
                    <View style={styles.headerCenter}>
                        {props.currentCli ? (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.cliSelector,
                                    canOpenPicker && pressed && { opacity: 0.72 },
                                ]}
                                onPress={canOpenPicker
                                    ? openCliPicker
                                    : undefined}
                            >
                                <Ionicons
                                    name={getPhoneCliIcon(props.currentCli)}
                                    size={15}
                                    color={theme.colors.text}
                                />
                                <Text numberOfLines={1} style={styles.cliSelectorText}>
                                    {getPhoneCliLabel(props.currentCli)}
                                </Text>
                                {canOpenPicker ? (
                                    <Ionicons
                                        name="chevron-down"
                                        size={15}
                                        color={theme.colors.textSecondary}
                                    />
                                ) : null}
                            </Pressable>
                        ) : (
                            <Text numberOfLines={1} style={styles.headerTitle}>
                                {props.title ?? ''}
                            </Text>
                        )}
                    </View>
                    <Pressable
                        style={({ pressed }) => [
                            styles.headerButton,
                            pressed && { opacity: 0.72 },
                        ]}
                        onPress={handleTrailingPress}
                    >
                        <Ionicons name={trailingIcon} size={22} color={theme.colors.text} />
                    </Pressable>
                </View>
                <View style={styles.body}>
                    {props.children}
                </View>
            </View>
            {props.currentCli && canOpenPicker ? (
                <PhoneCliPickerSheet
                    visible={isCliPickerOpen}
                    selectedTool={props.currentCli}
                    availableTools={availableCliTools}
                    configItems={props.configItems}
                    configSections={props.configSections}
                    onSelectTool={handleSelectTool}
                    onClose={handlePickerClose}
                />
            ) : null}
        </View>
    );
});
