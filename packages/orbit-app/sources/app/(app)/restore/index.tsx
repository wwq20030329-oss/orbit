import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { RoundButton } from '@/components/RoundButton';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { StyleSheet } from 'react-native-unistyles';

const stylesheet = StyleSheet.create((theme) => ({
    scrollView: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    contentWrapper: {
        width: '100%',
        maxWidth: layout.maxWidth,
        paddingVertical: 24,
    },
    instructionText: {
        fontSize: 20,
        color: theme.colors.text,
        marginBottom: 24,
        ...Typography.default(),
    },
    secondInstructionText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        marginBottom: 20,
        ...Typography.default(),
    },
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: 18,
        padding: 20,
        gap: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginTop: 12,
    },
    note: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));

export default function Restore() {
    const styles = stylesheet;
    const router = useRouter();

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.container}>
                <View style={styles.contentWrapper}>
                    <Text style={styles.instructionText}>
                        {t('connect.restoreAccount')}
                    </Text>
                    <Text style={styles.secondInstructionText}>
                        Use your access key to get back into Orbit. The QR linking flow is temporarily hidden on mobile until we finish stabilizing it.
                    </Text>
                    <View style={styles.card}>
                        <Text style={styles.note}>
                            If you already saved your secret key, tap below and paste it on the next screen.
                        </Text>
                        <RoundButton
                            title={t('navigation.restoreWithSecretKey')}
                            onPress={() => {
                                router.push('/restore/manual');
                            }}
                        />
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}
