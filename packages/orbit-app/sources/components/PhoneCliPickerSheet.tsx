import * as React from 'react';
import {
    Animated,
    Easing,
    InteractionManager,
    Pressable,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { layout } from '@/components/layout';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import type { PhoneCliTool } from '@/utils/phoneCli';
import { getPhoneCliIcon, getPhoneCliLabel } from '@/utils/phoneCli';

export interface PhoneCliPickerConfigOption {
    key: string;
    label: string;
}

export interface PhoneCliPickerConfigItem {
    key: 'model' | 'effort' | 'permission';
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
}

export interface PhoneCliPickerConfigSection {
    key: PhoneCliPickerConfigItem['key'];
    title: string;
    selectedKey?: string | null;
    options: PhoneCliPickerConfigOption[];
    onSelect: (key: string) => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    root: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-start',
        alignItems: 'center',
        zIndex: 100,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'transparent',
    },
    popover: {
        width: '100%',
        maxWidth: Math.min(layout.maxWidth - 48, 240),
        borderRadius: 22,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    options: {
        padding: 8,
        gap: 6,
    },
    sectionLabel: {
        paddingHorizontal: 6,
        paddingTop: 8,
        paddingBottom: 4,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    optionCard: {
        minHeight: 54,
        borderRadius: 16,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.colors.groupped.background,
    },
    optionCardActive: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    optionIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
    },
    optionTextWrap: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    optionSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    placeholderBar: {
        height: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceHigh,
    },
    placeholderIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: theme.colors.surfaceHigh,
    },
    placeholderChevron: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surfaceHigh,
    },
    detailHeader: {
        minHeight: 46,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailBackButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentShell: {
        minHeight: 156,
    },
}));

export function buildPhoneCliPickerSkeletonPlan(props: {
    currentSection: PhoneCliPickerConfigSection | null;
    availableTools: readonly PhoneCliTool[];
    configItems?: PhoneCliPickerConfigItem[];
    showToolSection?: boolean;
}) {
    return props.currentSection
        ? {
            mode: 'section' as const,
            sectionRowCount: props.currentSection.options.length,
            toolRowCount: 0,
            configRowCount: 0,
        }
        : {
            mode: 'overview' as const,
            sectionRowCount: 0,
            toolRowCount: props.showToolSection === false ? 0 : props.availableTools.length,
            configRowCount: props.configItems?.length ?? 0,
        };
}

export function shouldDeferPhoneCliPickerContent(hasWarmContent: boolean) {
    return !hasWarmContent;
}

function PhoneCliPickerSkeletonRow({ hasIcon }: { hasIcon: boolean }) {
    const styles = stylesheet;
    return (
        <View style={styles.optionCard}>
            {hasIcon ? <View style={styles.placeholderIcon} /> : null}
            <View style={styles.optionTextWrap}>
                <View style={[styles.placeholderBar, { width: '58%' }]} />
                <View style={[styles.placeholderBar, { width: '34%', height: 10 }]} />
            </View>
            <View style={styles.placeholderChevron} />
        </View>
    );
}

export const PhoneCliPickerSheet = React.memo((props: {
    visible: boolean;
    selectedTool: PhoneCliTool;
    availableTools: readonly PhoneCliTool[];
    initialSection?: PhoneCliPickerConfigItem['key'] | null;
    showToolSection?: boolean;
    configItems?: PhoneCliPickerConfigItem[];
    configSections?: PhoneCliPickerConfigSection[];
    onSelectTool: (tool: PhoneCliTool) => void;
    onClose: () => void;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const openProgress = React.useRef(new Animated.Value(0)).current;
    const openInteractionRef = React.useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
    const hasWarmContentRef = React.useRef(false);
    const [isMounted, setIsMounted] = React.useState(props.visible);
    const [contentReady, setContentReady] = React.useState(false);
    const [activeSection, setActiveSection] = React.useState<PhoneCliPickerConfigItem['key'] | null>(null);
    const previousVisibleRef = React.useRef(false);
    const backdropOpacity = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
        }),
        [openProgress],
    );
    const cardTranslateY = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-6, 0],
        }),
        [openProgress],
    );
    const cardScale = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.985, 1],
        }),
        [openProgress],
    );
    const contentOpacity = React.useMemo(
        () => openProgress.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [0, 0, 1],
        }),
        [openProgress],
    );

    const currentSection = React.useMemo(
        () => props.configSections?.find((section) => section.key === activeSection) ?? null,
        [activeSection, props.configSections],
    );
    const skeletonPlan = React.useMemo(
        () => buildPhoneCliPickerSkeletonPlan({
            currentSection,
            availableTools: props.availableTools,
            configItems: props.configItems,
            showToolSection: props.showToolSection,
        }),
        [currentSection, props.availableTools, props.configItems, props.showToolSection],
    );
    const estimatedContentHeight = React.useMemo(() => {
        if (currentSection) {
            return Math.max(156, 62 + (currentSection.options.length * 60));
        }

        const toolCount = props.showToolSection === false ? 0 : props.availableTools.length;
        const configCount = props.configItems?.length ?? 0;
        const toolLabelHeight = toolCount > 0 ? 24 : 0;
        const configLabelHeight = configCount > 0 ? 24 : 0;

        return Math.max(
            156,
            16
                + toolLabelHeight
                + (toolCount * 60)
                + configLabelHeight
                + (configCount * 60),
        );
    }, [currentSection, props.availableTools.length, props.configItems, props.showToolSection]);

    React.useEffect(() => {
        const wasVisible = previousVisibleRef.current;
        previousVisibleRef.current = props.visible;

        if (props.visible) {
            if (wasVisible) {
                return;
            }

            setIsMounted(true);
            setActiveSection(props.initialSection ?? null);
            const shouldDeferContent = shouldDeferPhoneCliPickerContent(hasWarmContentRef.current);
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
            openProgress.stopAnimation();
            openProgress.setValue(0);
            Animated.timing(openProgress, {
                toValue: 1,
                duration: 180,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();

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
        openProgress.stopAnimation();
        Animated.timing(openProgress, {
            toValue: 0,
            duration: 150,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) {
                setIsMounted(false);
                setActiveSection(null);
            }
        });
    }, [openProgress, props.initialSection, props.visible]);

    if (!isMounted) {
        return null;
    }

    return (
        <View pointerEvents="box-none" style={styles.root}>
            <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
            <Pressable style={styles.backdrop} onPress={props.onClose} />
            <Animated.View
                style={[
                    styles.popover,
                    {
                        marginTop: insets.top + 50,
                        transform: [
                            { translateY: cardTranslateY },
                            { scale: cardScale },
                        ],
                    },
                ]}
            >
                <Animated.View
                    style={[
                        styles.options,
                        styles.contentShell,
                        {
                            minHeight: estimatedContentHeight,
                            opacity: contentOpacity,
                        },
                    ]}
                >
                    {currentSection ? (
                        <>
                            <View style={styles.detailHeader}>
                                <Pressable
                                    style={styles.detailBackButton}
                                    onPress={() => setActiveSection(null)}
                                >
                                    <Ionicons name="chevron-back" size={20} color={theme.colors.textSecondary} />
                                </Pressable>
                                <Text style={styles.optionTitle}>{currentSection.title}</Text>
                            </View>
                            {contentReady
                                ? currentSection.options.map((option) => {
                                    const isActive = option.key === currentSection.selectedKey;
                                    return (
                                        <Pressable
                                            key={option.key}
                                            style={({ pressed }) => [
                                                styles.optionCard,
                                                isActive && styles.optionCardActive,
                                                pressed && { opacity: 0.86 },
                                            ]}
                                            onPress={() => {
                                                currentSection.onSelect(option.key);
                                                props.onClose();
                                            }}
                                        >
                                            <View style={styles.optionTextWrap}>
                                                <Text style={styles.optionTitle}>{option.label}</Text>
                                            </View>
                                            {isActive ? (
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={22}
                                                    color={theme.colors.button.primary.background}
                                                />
                                            ) : (
                                                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                                            )}
                                        </Pressable>
                                    );
                                })
                                : Array.from({ length: skeletonPlan.sectionRowCount }).map((_, index) => (
                                    <PhoneCliPickerSkeletonRow key={`section-placeholder-${index}`} hasIcon={false} />
                                ))}
                        </>
                    ) : (
                        <>
                            {props.showToolSection !== false ? (
                                <>
                                    <Text style={styles.sectionLabel}>CLI</Text>
                                    {contentReady
                                        ? props.availableTools.map((tool) => {
                                            const isActive = tool === props.selectedTool;
                                            return (
                                                <Pressable
                                                    key={tool}
                                                    style={({ pressed }) => [
                                                        styles.optionCard,
                                                        isActive && styles.optionCardActive,
                                                        pressed && { opacity: 0.86 },
                                                    ]}
                                                    onPress={() => {
                                                        props.onSelectTool(tool);
                                                        props.onClose();
                                                    }}
                                                >
                                                    <View style={styles.optionIconWrap}>
                                                        <Ionicons
                                                            name={getPhoneCliIcon(tool)}
                                                            size={18}
                                                            color={isActive ? theme.colors.button.primary.background : theme.colors.text}
                                                        />
                                                    </View>
                                                    <View style={styles.optionTextWrap}>
                                                        <Text style={styles.optionTitle}>{getPhoneCliLabel(tool)}</Text>
                                                    </View>
                                                    {isActive ? (
                                                        <Ionicons
                                                            name="checkmark-circle"
                                                            size={22}
                                                            color={theme.colors.button.primary.background}
                                                        />
                                                    ) : (
                                                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                                                    )}
                                                </Pressable>
                                            );
                                        })
                                        : Array.from({ length: skeletonPlan.toolRowCount }).map((_, index) => (
                                            <PhoneCliPickerSkeletonRow key={`tool-placeholder-${index}`} hasIcon />
                                        ))}
                                </>
                            ) : null}
                            {props.configItems?.length ? (
                                <>
                                    <Text style={styles.sectionLabel}>当前配置</Text>
                                    {contentReady
                                        ? props.configItems.map((item) => (
                                            <Pressable
                                                key={item.key}
                                                style={({ pressed }) => [
                                                    styles.optionCard,
                                                    pressed && { opacity: 0.86 },
                                                ]}
                                                onPress={() => setActiveSection(item.key)}
                                            >
                                                <View style={styles.optionIconWrap}>
                                                    <Ionicons
                                                        name={item.icon}
                                                        size={18}
                                                        color={theme.colors.text}
                                                    />
                                                </View>
                                                <View style={styles.optionTextWrap}>
                                                    <Text style={styles.optionTitle}>{item.label}</Text>
                                                    <Text style={styles.optionSubtitle}>{item.value}</Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                                            </Pressable>
                                        ))
                                        : Array.from({ length: skeletonPlan.configRowCount }).map((_, index) => (
                                            <PhoneCliPickerSkeletonRow key={`config-placeholder-${index}`} hasIcon />
                                        ))}
                                </>
                            ) : null}
                        </>
                    )}
                </Animated.View>
            </Animated.View>
        </View>
    );
});
