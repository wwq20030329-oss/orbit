import * as React from 'react';
import { Text, View } from 'react-native';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';

export function BrandGlyph({ size = 32 }: { size?: number }) {
    const { theme } = useUnistyles();

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: Math.round(size / 2),
                borderWidth: 2,
                borderColor: theme.colors.header.tint,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surface,
            }}
        >
            <View
                style={{
                    width: Math.round(size * 0.22),
                    height: Math.round(size * 0.22),
                    borderRadius: Math.round(size * 0.11),
                    backgroundColor: theme.colors.header.tint,
                }}
            />
        </View>
    );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
    const { theme } = useUnistyles();

    return (
        <View style={{ alignItems: compact ? 'flex-start' : 'center' }}>
            <Text
                style={{
                    ...Typography.logo(),
                    fontSize: compact ? 34 : 42,
                    lineHeight: compact ? 38 : 46,
                    color: theme.colors.text,
                    textAlign: compact ? 'left' : 'center',
                }}
            >
                Orbit
            </Text>
            <Text
                style={{
                    ...Typography.mono(),
                    fontSize: compact ? 11 : 12,
                    lineHeight: compact ? 16 : 18,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: theme.colors.textSecondary,
                    marginTop: 4,
                    textAlign: compact ? 'left' : 'center',
                }}
            >
                Remote control for Claude Code
            </Text>
        </View>
    );
}
