import * as React from 'react';
import { Text, View } from 'react-native';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function BrandGlyph({ size = 32 }: { size?: number }) {
    const { theme } = useUnistyles();
    const svgId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const backgroundGradientId = `orbit-brand-bg-${svgId}`;
    const ringGradientId = `orbit-brand-ring-${svgId}`;
    const isDark = Boolean(theme.dark);
    const backgroundTop = isDark ? '#111821' : '#F7F2E8';
    const backgroundBottom = isDark ? '#06080C' : '#ECE6D9';
    const foreground = isDark ? '#F7F2E8' : '#0B0F14';
    const deviceFill = isDark ? '#0B0F14' : '#F7F2E8';
    const accent = '#63E37A';

    return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
            <Defs>
                <LinearGradient id={backgroundGradientId} x1="9" y1="5" x2="55" y2="60" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={backgroundTop} />
                    <Stop offset="1" stopColor={backgroundBottom} />
                </LinearGradient>
                <LinearGradient id={ringGradientId} x1="18" y1="47" x2="50" y2="16" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#55C8FF" />
                    <Stop offset="1" stopColor={accent} />
                </LinearGradient>
            </Defs>
            <Rect x="1" y="1" width="62" height="62" rx="15" fill={`url(#${backgroundGradientId})`} />
            <G>
                <Circle cx="32" cy="32" r="17.6" fill="none" stroke={foreground} strokeWidth="5.8" />
                <Path
                    d="M19 43.7C13.8 37.5 13.7 27.8 18.9 21.4C25.2 13.5 36.7 12.3 44.5 18.7C51 24 53 33 49.7 40.3"
                    fill="none"
                    stroke={`url(#${ringGradientId})`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                />
                <Rect x="16.3" y="37.2" width="7.3" height="11" rx="2.4" fill={deviceFill} stroke={foreground} strokeWidth="1.8" />
                <Rect x="41.7" y="15.8" width="9.8" height="7.2" rx="2.1" fill={foreground} />
                <Rect x="43.8" y="17.8" width="5.6" height="3" rx="1" fill={deviceFill} />
                <Path
                    d="M26 24L34.5 32L26 40"
                    fill="none"
                    stroke={foreground}
                    strokeWidth="5.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <Rect x="36.3" y="38.4" width="9.8" height="4.1" rx="2" fill={accent} />
            </G>
        </Svg>
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
