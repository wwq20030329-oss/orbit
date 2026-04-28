import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from '@/constants/Typography';
import { RoundButton } from '@/components/RoundButton';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { useRouter } from 'expo-router';
import { Modal } from '@/modal';
import { t } from '@/text';
import { getTerminalAuthPlaceholder } from '@/utils/appUrlScheme';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingBottom: 32,
    },
    hero: {
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    heroIconWrap: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        backgroundColor: theme.colors.surface,
    },
    title: {
        marginBottom: 10,
        textAlign: 'center',
        fontSize: 28,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 22,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        maxWidth: 280,
    },
    buttonsContainer: {
        alignItems: 'center',
        width: '100%',
        maxWidth: 360,
    },
    buttonWrapper: {
        width: '100%',
        marginBottom: 12,
    },
    buttonWrapperSecondary: {
        width: '100%',
    },
}));

export function EmptyMainScreen() {
    const router = useRouter();
    const { theme } = useUnistyles();
    const machines = useAllMachines({ includeOffline: true });
    const hasRegisteredMachines = machines.length > 0;
    const hasOnlineMachines = React.useMemo(() => {
        return machines.some((machine) => isMachineOnline(machine));
    }, [machines]);
    const { connectTerminal, connectWithUrl, isLoading } = useConnectTerminal({
        onSuccess: () => {
            router.navigate('/new');
        }
    });
    const styles = stylesheet;

    return (
        <View style={styles.container}>
            <View style={styles.hero}>
                <View style={styles.heroIconWrap}>
                    <Ionicons name="chatbubbles-outline" size={24} color={theme.colors.text} />
                </View>
                <Text style={styles.title}>
                    {hasRegisteredMachines ? t('newSession.title') : t('components.emptyMainScreen.readyToCode')}
                </Text>
                <Text style={styles.subtitle}>
                    {hasOnlineMachines
                        ? t('newSession.switchMachinesHint')
                        : hasRegisteredMachines
                            ? t('components.emptySessionsTablet.offlineDescription')
                        : t('welcome.subtitle')}
                </Text>
            </View>

            {(
                <View style={styles.buttonsContainer}>
                    <View style={styles.buttonWrapper}>
                        <RoundButton
                            title={hasRegisteredMachines ? t('newSession.title') : t('components.emptyMainScreen.openCamera')}
                            size="large"
                            loading={isLoading}
                            onPress={hasRegisteredMachines ? (() => router.navigate('/new')) : connectTerminal}
                        />
                    </View>
                    {!hasRegisteredMachines && (
                        <View style={styles.buttonWrapperSecondary}>
                            <RoundButton
                                title={t('connect.enterUrlManually')}
                                size="normal"
                                display="inverted"
                                onPress={async () => {
                                    const url = await Modal.prompt(
                                        t('modals.authenticateTerminal'),
                                        t('modals.pasteUrlFromTerminal'),
                                        {
                                            placeholder: getTerminalAuthPlaceholder(),
                                            cancelText: t('common.cancel'),
                                            confirmText: t('common.authenticate'),
                                            inputType: 'url',
                                        }
                                    );

                                    if (url?.trim()) {
                                        connectWithUrl(url.trim());
                                    }
                                }}
                            />
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}
