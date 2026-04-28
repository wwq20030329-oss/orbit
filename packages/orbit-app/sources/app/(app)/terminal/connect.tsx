import React, { useState, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
import { RoundButton } from '@/components/RoundButton';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { Ionicons } from '@expo/vector-icons';
import { ItemList } from '@/components/ItemList';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { t } from '@/text';
import { buildTerminalAuthUrl } from '@/utils/appUrlScheme';

export default function TerminalConnectScreen() {
    const router = useRouter();
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [hashProcessed, setHashProcessed] = useState(false);
    const { processAuthUrl, isLoading } = useConnectTerminal({
        onSuccess: () => {
            router.back();
        }
    });

    const handleConnect = async () => {
        if (publicKey) {
            const authUrl = buildTerminalAuthUrl(publicKey);
            await processAuthUrl(authUrl);
        }
    };

    const handleReject = () => {
        router.back();
    };

    // Mobile platforms: show placeholder explaining this flow originates from a desktop browser
    return (
        <ItemList>
            <ItemGroup>
                <View style={{
                    alignItems: 'center',
                    paddingVertical: 32,
                    paddingHorizontal: 16
                }}>
                    <Ionicons
                        name="laptop-outline"
                        size={64}
                        color="#8E8E93"
                        style={{ marginBottom: 16 }}
                    />
                    <Text style={{
                        ...Typography.default('semiBold'),
                        fontSize: 18,
                        textAlign: 'center',
                        marginBottom: 12
                    }}>
                        {t('terminal.webBrowserRequired')}
                    </Text>
                    <Text style={{
                        ...Typography.default(),
                        fontSize: 14,
                        color: '#666',
                        textAlign: 'center',
                        lineHeight: 20
                    }}>
                        {t('terminal.webBrowserRequiredDescription')}
                    </Text>
                </View>
            </ItemGroup>
        </ItemList>
    );
}
