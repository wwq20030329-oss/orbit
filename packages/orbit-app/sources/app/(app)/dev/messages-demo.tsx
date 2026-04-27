import * as React from 'react';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { MessageView } from '@/components/MessageView';
import { debugMessages } from '@/dev/messages-demo-data';
import { storage } from '@/sync/storage';
import { Message } from '@/sync/typesMessage';
import { useDemoMessages } from '@/hooks/useDemoMessages';
import { OrbitRemoteSessionManager } from '@/remote/OrbitRemoteSessionManager';
import type { Option } from '@/components/markdown/MarkdownView';

export default React.memo(function MessagesDemoScreen() {
    // Combine all demo messages
    const allMessages = [...debugMessages];

    // Load demo messages into session storage
    const sessionId = useDemoMessages(allMessages);
    const markdownCopyV2 = storage((state) => state.localSettings.markdownCopyV2);
    const remoteSessionManager = React.useMemo(() => new OrbitRemoteSessionManager(sessionId), [sessionId]);
    const handleOptionPress = React.useCallback((option: Option) => {
        void remoteSessionManager.sendCurrentSessionMessage({
            content: option.title,
            source: 'option',
        }).catch((error) => {
            console.warn('Failed to send demo message option', error);
        });
    }, [remoteSessionManager]);

    return (
        <View style={styles.container}>
            {allMessages.length > 0 && (
                <FlatList
                    data={allMessages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <MessageView
                            message={item}
                            metadata={null}
                            sessionId={sessionId}
                            markdownCopyV2={markdownCopyV2}
                            onOptionPress={handleOptionPress}
                            getMessageById={(id: string): Message | null => {
                                return allMessages.find((m)=>m.id === id) || null;
                            }}
                        />
                    )}
                    style={{ flexGrow: 1, flexBasis: 0 }}
                    contentContainerStyle={{ paddingVertical: 20 }}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
}));
