import { Stack } from 'expo-router';
import * as React from 'react';
import { useUnistyles } from 'react-native-unistyles';

import { SettingsFloatingFrame } from '@/components/SettingsViewWrapper';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

export function buildSettingsStackScreenOptions(args: {
    textColor: string;
    backgroundColor: string;
}) {
    return {
        headerTintColor: args.textColor,
        headerTitleAlign: 'center' as const,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal' as const,
        freezeOnBlur: true,
        headerStyle: {
            backgroundColor: args.backgroundColor,
        },
        headerTitleStyle: {
            ...Typography.default('semiBold'),
            fontSize: 17,
            color: args.textColor,
        },
        contentStyle: {
            backgroundColor: args.backgroundColor,
        },
        animation: 'default' as const,
    };
}

export function buildSettingsIndexScreenOptions() {
    return {
        headerShown: false,
        freezeOnBlur: true,
        animation: 'none' as const,
        contentStyle: {
            backgroundColor: 'transparent',
        },
    };
}

export default function SettingsLayout() {
    const { theme } = useUnistyles();
    const screenOptions = React.useMemo(
        () => buildSettingsStackScreenOptions({
            textColor: theme.colors.text,
            backgroundColor: theme.colors.groupped.background,
        }),
        [theme.colors.groupped.background, theme.colors.text],
    );
    const indexScreenOptions = React.useMemo(
        () => buildSettingsIndexScreenOptions(),
        [],
    );

    return (
        <SettingsFloatingFrame>
            <Stack
                screenOptions={screenOptions}
            >
                <Stack.Screen
                    name="index"
                    options={indexScreenOptions}
                />
                <Stack.Screen
                    name="account"
                    options={{
                        title: t('settings.account'),
                    }}
                />
                <Stack.Screen
                    name="appearance"
                    options={{
                        title: t('settings.appearance'),
                    }}
                />
                <Stack.Screen
                    name="features"
                    options={{
                        title: t('settings.featuresTitle'),
                    }}
                />
                <Stack.Screen
                    name="language"
                    options={{
                        title: t('settingsLanguage.title'),
                    }}
                />
                <Stack.Screen
                    name="voice"
                    options={{
                        title: t('settings.voiceAssistant'),
                    }}
                />
                <Stack.Screen
                    name="machines"
                    options={{
                        title: t('settings.machines'),
                    }}
                />
                <Stack.Screen
                    name="about"
                    options={{
                        title: t('settings.about'),
                    }}
                />
                <Stack.Screen
                    name="usage"
                    options={{
                        title: t('settings.usage'),
                    }}
                />
                <Stack.Screen
                    name="voice/language"
                    options={{
                        title: t('settingsVoice.languageTitle'),
                    }}
                />
            </Stack>
        </SettingsFloatingFrame>
    );
}
