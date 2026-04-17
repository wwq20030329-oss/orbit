import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { getServerUrl, isUsingCustomServer } from '@/sync/serverConfig';
import { StyleSheet } from 'react-native-unistyles';

const stylesheet = StyleSheet.create((theme) => ({
    itemListContainer: {
        flex: 1,
    },
    contentContainer: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
    },
    labelText: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    valueText: {
        backgroundColor: theme.colors.input.background,
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
        ...Typography.mono(),
        fontSize: 14,
        color: theme.colors.input.text,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 20,
    },
    infoText: {
        ...Typography.default(),
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        marginTop: 12,
    },
}));

export default function ServerConfigScreen() {
    const styles = stylesheet;
    const serverUrl = getServerUrl();
    const isCustomServer = isUsingCustomServer();

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('server.serverConfiguration'),
                    headerBackTitle: t('common.back'),
                }}
            />

            <ItemList style={styles.itemListContainer}>
                <ItemGroup footer="Server selection is now locked in Orbit builds. To change environments, rebuild the app with EXPO_PUBLIC_SERVER_URL before bundling.">
                    <View style={styles.contentContainer}>
                        <Text style={styles.labelText}>SERVER URL</Text>
                        <Text selectable style={styles.valueText}>
                            {serverUrl}
                        </Text>
                        <Text style={styles.statusText}>
                            {isCustomServer
                                ? 'This build was compiled against a non-default Orbit server.'
                                : 'This build is locked to the default Orbit server.'}
                        </Text>
                        <Text style={styles.infoText}>
                            Legacy on-device server overrides are cleared automatically on launch and can no longer replace the bundled Orbit server.
                        </Text>
                    </View>
                </ItemGroup>
            </ItemList>
        </>
    );
}
