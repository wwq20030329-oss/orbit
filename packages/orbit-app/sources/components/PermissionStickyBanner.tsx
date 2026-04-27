import * as React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import type { ToolCallMessage } from '@/sync/typesMessage';
import type { Metadata } from '@/sync/storageTypes';
import { PermissionFooter } from '@/components/tools/PermissionFooter';

interface PermissionStickyBannerProps {
    pending: ToolCallMessage[];
    sessionId: string;
    metadata: Metadata | null;
}

/**
 * Always-visible action surface for the oldest pending permission. Renders
 * just above the composer so the user never has to scroll up to grant or
 * deny. When more than one permission is queued, a subtle count badge hints
 * at the backlog without forcing the rest of the queue into view.
 */
export const PermissionStickyBanner = React.memo<PermissionStickyBannerProps>((props) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const head = props.pending[0];
    if (!head || !head.tool) return null;

    const remaining = props.pending.length - 1;

    return (
        <Animated.View
            style={styles.container}
            entering={SlideInDown.duration(260).springify().damping(18)}
            exiting={SlideOutDown.duration(180)}
        >
            <View style={styles.headerRow}>
                <Ionicons name="warning-outline" size={14} color={theme.colors.warning} />
                <Text style={styles.headerText}>Approval needed</Text>
                {remaining > 0 ? (
                    <Animated.View
                        key={remaining}
                        entering={FadeIn.duration(180)}
                        exiting={FadeOut.duration(120)}
                        style={styles.countBadge}
                    >
                        <Text style={styles.countBadgeText}>+{remaining}</Text>
                    </Animated.View>
                ) : null}
            </View>
            <PermissionFooter
                permission={head.tool.permission!}
                sessionId={props.sessionId}
                toolName={head.tool.name}
                toolInput={head.tool.input}
                metadata={props.metadata}
            />
        </Animated.View>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.warning,
        overflow: 'hidden',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 4,
    },
    headerText: {
        fontSize: 12,
        color: theme.colors.warning,
        fontWeight: '600',
    },
    countBadge: {
        marginLeft: 'auto',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        backgroundColor: theme.colors.warning,
    },
    countBadgeText: {
        fontSize: 11,
        color: theme.colors.surface,
        fontWeight: '700',
    },
}));
