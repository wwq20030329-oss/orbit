import React from 'react';
import { View, Text } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import { GitStatus } from '@/sync/storageTypes';
import { useUnistyles } from 'react-native-unistyles';

export function hasRenderableGitStatus(gitStatus: GitStatus | null | undefined): boolean {
    return Boolean(gitStatus && gitStatus.lastUpdatedAt > 0);
}

interface GitStatusBadgeProps {
    gitStatus: GitStatus;
}

export function GitStatusBadge({ gitStatus }: GitStatusBadgeProps) {
    const { theme } = useUnistyles();

    // Always show if git repository exists, even without changes
    if (!hasRenderableGitStatus(gitStatus)) {
        return null;
    }

    const hasLineChanges = gitStatus.unstagedLinesAdded > 0 || gitStatus.unstagedLinesRemoved > 0;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
            {/* Git icon - always shown */}
            <Octicons
                name="git-branch"
                size={16}
                color={theme.colors.button.secondary.tint}
            />

            {/* Line changes only */}
            {hasLineChanges && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    {gitStatus.unstagedLinesAdded > 0 && (
                        <Text
                            style={{
                                fontSize: 12,
                                color: theme.colors.gitAddedText,
                                fontWeight: '600',
                            }}
                            numberOfLines={1}
                        >
                            +{gitStatus.unstagedLinesAdded}
                        </Text>
                    )}
                    {gitStatus.unstagedLinesRemoved > 0 && (
                        <Text
                            style={{
                                fontSize: 12,
                                color: theme.colors.gitRemovedText,
                                fontWeight: '600',
                            }}
                            numberOfLines={1}
                        >
                            -{gitStatus.unstagedLinesRemoved}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}
