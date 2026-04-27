import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolSectionView } from '../ToolSectionView';
import { encodeBase64Text } from '@/encryption/base64';
import { t } from '@/text';
import {
    FileChangeSummaryItem,
    getDefaultFileChangeLabel,
    summarizeFileChangeItems,
} from './fileChangeSummary';

interface FileChangeSummaryViewProps {
    items: FileChangeSummaryItem[];
    sessionId?: string;
}

export const FileChangeSummaryView = React.memo<FileChangeSummaryViewProps>(({ items, sessionId }) => {
    const router = useRouter();
    const { theme } = useUnistyles();
    const { visibleItems, hiddenCount } = summarizeFileChangeItems(items);

    if (visibleItems.length === 0) {
        return null;
    }

    return (
        <ToolSectionView fullWidth>
            <View style={styles.container}>
                {visibleItems.map((item, index) => {
                    const label = item.label || getDefaultFileChangeLabel(item.path);
                    const canOpen = !!sessionId && !item.disabled;

                    return (
                        <Pressable
                            key={item.path}
                            disabled={!canOpen}
                            onPress={() => {
                                if (!sessionId || item.disabled) return;
                                const encodedPath = encodeBase64Text(item.path, 'base64url');
                                router.push(`/session/${sessionId}/file?path=${encodedPath}`);
                            }}
                            style={({ pressed }) => [
                                styles.row,
                                index < visibleItems.length - 1 || hiddenCount > 0 ? styles.rowBorder : null,
                                canOpen && pressed ? { opacity: 0.65 } : null,
                            ]}
                        >
                            <Octicons name="file" size={14} color={theme.colors.textSecondary} />
                            <Text numberOfLines={1} style={[styles.label, item.disabled ? styles.labelDisabled : null]}>
                                {label}
                            </Text>
                            {canOpen ? (
                                <Octicons name="chevron-right" size={14} color={theme.colors.textSecondary} />
                            ) : null}
                        </Pressable>
                    );
                })}

                {hiddenCount > 0 ? (
                    <View style={styles.moreRow}>
                        <Text style={styles.moreText}>
                            {t('tools.desc.moreFiles', { count: hiddenCount })}
                        </Text>
                    </View>
                ) : null}
            </View>
        </ToolSectionView>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        overflow: 'hidden',
    },
    row: {
        minHeight: 40,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    label: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.text,
    },
    labelDisabled: {
        color: theme.colors.textSecondary,
    },
    moreRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    moreText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
}));
