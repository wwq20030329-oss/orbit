import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { QRCode } from '@/components/qr';
import { RoundButton } from '@/components/RoundButton';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { StyleSheet } from 'react-native-unistyles';
import { authQRStart, generateAuthKeyPair } from '@/auth/authQRStart';
import { authQRWait } from '@/auth/authQRWait';
import { encodeBase64 } from '@/encryption/base64';
import { trackAccountRestored } from '@/track';
import { buildAccountLinkUrl } from '@/auth/accountLinkUrl';

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
    qrWrapper: {
        alignItems: 'center',
        marginBottom: 20,
    },
    qrCard: {
        width: '100%',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 18,
        padding: 20,
        gap: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: 16,
    },
    qrHint: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    statusText: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        color: theme.colors.textSecondary,
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
    const auth = useAuth();
    const [status, setStatus] = React.useState<'loading' | 'ready' | 'authorizing' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [qrData, setQrData] = React.useState<string | null>(null);
    const cancelRef = React.useRef(false);

    const startQrFlow = React.useCallback(async () => {
        cancelRef.current = false;
        setStatus('loading');
        setErrorMessage(null);
        setQrData(null);

        const keypair = generateAuthKeyPair();
        const publicKey = encodeBase64(keypair.publicKey, 'base64url');
        setQrData(buildAccountLinkUrl(publicKey));

        const started = await authQRStart(keypair);
        if (!started) {
            setStatus('error');
            setErrorMessage('无法创建二维码恢复请求，请稍后再试。');
            return;
        }

        setStatus('ready');

        const credentials = await authQRWait(
            keypair,
            undefined,
            () => cancelRef.current,
        );

        if (cancelRef.current || !credentials) {
            if (!cancelRef.current) {
                setStatus('error');
                setErrorMessage('二维码恢复超时或失败，请重试或改用密钥恢复。');
            }
            return;
        }

        setStatus('authorizing');

        try {
            await auth.login(credentials.token, encodeBase64(credentials.secret, 'base64url'));
            trackAccountRestored();
            router.replace('/');
        } catch (error) {
            console.error('QR restore login failed:', error);
            setStatus('error');
            setErrorMessage('二维码恢复完成，但登录失败，请重试。');
        }
    }, [auth, router]);

    React.useEffect(() => {
        void startQrFlow();
        return () => {
            cancelRef.current = true;
        };
    }, [startQrFlow]);

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.container}>
                <View style={styles.contentWrapper}>
                    <Text style={styles.instructionText}>
                        {t('connect.restoreAccount')}
                    </Text>
                    <Text style={styles.secondInstructionText}>
                        用另一台已登录 Orbit 的设备扫描下面的二维码即可恢复。可以直接用 Orbit 里的扫码器，也可以用系统相机。没有旧设备时，再使用密钥恢复。
                    </Text>
                    <View style={styles.qrCard}>
                        <View style={styles.qrWrapper}>
                            {qrData && status !== 'loading' ? (
                                <QRCode data={qrData} size={220} />
                            ) : (
                                <ActivityIndicator size="large" />
                            )}
                        </View>
                        <Text style={styles.qrHint}>
                            在另一台已登录设备中打开“账号”页扫码，或直接用系统相机扫描此二维码。
                        </Text>
                        {status === 'authorizing' ? (
                            <Text style={styles.statusText}>正在等待授权结果...</Text>
                        ) : null}
                        {status === 'error' && errorMessage ? (
                            <>
                                <Text style={styles.statusText}>{errorMessage}</Text>
                                <RoundButton
                                    title={t('common.retry')}
                                    onPress={() => {
                                        void startQrFlow();
                                    }}
                                />
                            </>
                        ) : null}
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.note}>
                            如果你已经保存了密钥，可以直接手动粘贴恢复。
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
