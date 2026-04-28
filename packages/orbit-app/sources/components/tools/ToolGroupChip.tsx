import * as React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Pressable } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Octicons, Ionicons } from '@expo/vector-icons';
import type { ToolCallMessage } from '@/sync/typesMessage';
import type { Metadata } from '@/sync/storageTypes';
import { MessageView } from '@/components/MessageView';
import { hapticsLight } from '@/components/haptics';

interface ToolGroupChipProps {
    tools: ToolCallMessage[];
    metadata: Metadata | null;
    sessionId: string;
    markdownCopyV2: boolean;
}

type Bucket = { label: string; icon: keyof typeof Octicons.glyphMap; count: number };

function summarizeTools(tools: ToolCallMessage[]): Bucket[] {
    let reads = 0;
    let greps = 0;
    let lists = 0;
    let globs = 0;
    let notebookReads = 0;

    for (const m of tools) {
        const name = m.tool?.name;
        if (!name) continue;
        if (name === 'Read' || name === 'read') reads++;
        else if (name === 'Grep' || name === 'grep') greps++;
        else if (name === 'LS') lists++;
        else if (name === 'Glob' || name === 'glob') globs++;
        else if (name === 'NotebookRead') notebookReads++;
    }

    const out: Bucket[] = [];
    if (reads > 0) out.push({ label: `Read ${reads}`, icon: 'eye', count: reads });
    if (greps > 0) out.push({ label: `Grep ${greps}`, icon: 'search', count: greps });
    if (globs > 0) out.push({ label: `Glob ${globs}`, icon: 'file-directory', count: globs });
    if (lists > 0) out.push({ label: `List ${lists}`, icon: 'list-unordered', count: lists });
    if (notebookReads > 0) out.push({ label: `Notebook ${notebookReads}`, icon: 'book', count: notebookReads });
    return out;
}

export const ToolGroupChip = React.memo<ToolGroupChipProps>((props) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);

    const buckets = React.useMemo(() => summarizeTools(props.tools), [props.tools]);
    const total = props.tools.length;

    const toggle = React.useCallback(() => {
        hapticsLight();
        setExpanded((v) => !v);
    }, []);

    if (expanded) {
        return (
            <Animated.View
                style={styles.expandedContainer}
                layout={LinearTransition.duration(220)}
            >
                <Pressable style={styles.collapseHeader} onPress={toggle}>
                    <Animated.View entering={FadeIn.duration(150)}>
                        <Octicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
                    </Animated.View>
                    <Text style={styles.collapseText}>
                        Investigation · {total} {total === 1 ? 'step' : 'steps'}
                    </Text>
                </Pressable>
                {props.tools.map((m, idx) => (
                    <Animated.View
                        key={m.id}
                        entering={FadeIn.duration(180).delay(idx * 30)}
                        exiting={FadeOut.duration(120)}
                    >
                        <MessageView
                            message={m}
                            metadata={props.metadata}
                            sessionId={props.sessionId}
                            markdownCopyV2={props.markdownCopyV2}
                        />
                    </Animated.View>
                ))}
            </Animated.View>
        );
    }

    return (
        <Animated.View layout={LinearTransition.duration(220)}>
            <Pressable
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                onPress={toggle}
            >
                <Ionicons name="search-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.chipText} numberOfLines={1}>
                    Investigation · {buckets.map((b) => b.label).join(' · ')}
                </Text>
                <Octicons name="chevron-right" size={14} color={theme.colors.textSecondary} />
            </Pressable>
        </Animated.View>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    chip: {
        marginHorizontal: 16,
        marginVertical: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceHigh,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        maxWidth: '85%',
    },
    chipText: {
        flexShrink: 1,
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    expandedContainer: {
        marginHorizontal: 8,
    },
    collapseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    collapseText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
}));
