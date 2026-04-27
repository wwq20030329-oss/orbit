import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons } from '@expo/vector-icons';

interface CollapsibleOutputProps {
    children: React.ReactNode;
    /** Total line count (used for the call-to-action label). */
    totalLines: number;
    /** Visible line budget while collapsed. Default 8. */
    maxLines?: number;
    /** Optional handler — opens a fullscreen viewer when supplied. */
    onExpandFullscreen?: () => void;
    /** Optional preview body to show when collapsed; otherwise children clipped via maxHeight. */
    previewText?: string;
}

const DEFAULT_MAX_LINES = 8;
const APPROX_LINE_HEIGHT = 18;

/**
 * Generic collapse wrapper used by tool views (Bash, Write, MultiEdit) that
 * may produce hundreds of lines of output. Keeps inverted FlashList layout
 * stable by capping the rendered height when the content exceeds maxLines.
 */
export const CollapsibleOutput = React.memo<CollapsibleOutputProps>((props) => {
    const { totalLines, onExpandFullscreen, previewText } = props;
    const maxLines = props.maxLines ?? DEFAULT_MAX_LINES;
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);

    const shouldCollapse = totalLines > maxLines;
    if (!shouldCollapse) {
        return <>{props.children}</>;
    }

    const handleToggle = () => {
        if (onExpandFullscreen) {
            onExpandFullscreen();
            return;
        }
        setExpanded((v) => !v);
    };

    const overflow = totalLines - maxLines;
    const containerStyle = expanded
        ? undefined
        : { maxHeight: maxLines * APPROX_LINE_HEIGHT + 8, overflow: 'hidden' as const };

    return (
        <Animated.View layout={LinearTransition.duration(220)}>
            <Animated.View style={containerStyle} layout={LinearTransition.duration(220)}>
                {previewText && !expanded ? (
                    <Text style={styles.previewText} numberOfLines={maxLines}>
                        {previewText}
                    </Text>
                ) : (
                    <Animated.View entering={FadeIn.duration(180)}>
                        {props.children}
                    </Animated.View>
                )}
            </Animated.View>
            <Pressable
                style={({ pressed }) => [styles.expandButton, pressed && { opacity: 0.6 }]}
                onPress={handleToggle}
            >
                <Octicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={theme.colors.textSecondary}
                />
                <Text style={styles.expandLabel}>
                    {expanded
                        ? 'Collapse'
                        : onExpandFullscreen
                            ? `View output (${totalLines} lines)`
                            : `Show ${overflow} more lines`}
                </Text>
            </Pressable>
        </Animated.View>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    previewText: {
        fontFamily: 'Menlo',
        fontSize: 12,
        color: theme.colors.text,
        lineHeight: APPROX_LINE_HEIGHT,
    },
    expandButton: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
    },
    expandLabel: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
}));
