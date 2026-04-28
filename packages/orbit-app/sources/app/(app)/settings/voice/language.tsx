import React, { useState, useMemo } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSettingMutable } from '@/sync/storage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { LANGUAGES, getLanguageDisplayName } from '@/constants/Languages';
import { t } from '@/text';

const stylesheet = StyleSheet.create((theme) => ({
    searchWrap: {
        paddingHorizontal: 16,
        marginTop: 4,
    },
    searchCard: {
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.input.text,
    },
}));

export default function LanguageSelectionScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const [voiceAssistantLanguage, setVoiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const [searchQuery, setSearchQuery] = useState('');

    // Filter languages based on search query
    const filteredLanguages = useMemo(() => {
        if (!searchQuery) return LANGUAGES;
        
        const query = searchQuery.toLowerCase();
        return LANGUAGES.filter(lang => 
            lang.name.toLowerCase().includes(query) ||
            lang.nativeName.toLowerCase().includes(query) ||
            (lang.code && lang.code.toLowerCase().includes(query)) ||
            (lang.region && lang.region.toLowerCase().includes(query))
        );
    }, [searchQuery]);


    const handleLanguageSelect = (languageCode: string | null) => {
        setVoiceAssistantLanguage(languageCode);
        router.back();
    };

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <View style={styles.searchWrap}>
                <View style={styles.searchCard}>
                    <Ionicons 
                        name="search-outline" 
                        size={20} 
                        color={theme.colors.textSecondary} 
                    />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('settingsVoice.language.searchPlaceholder')}
                        placeholderTextColor={theme.colors.input.placeholder}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {searchQuery.length > 0 && (
                        <Pressable onPress={() => setSearchQuery('')}>
                            <Ionicons
                                name="close-circle"
                                size={20}
                                color={theme.colors.textSecondary}
                            />
                        </Pressable>
                    )}
                </View>
            </View>

            <ItemGroup 
                title={t('settingsVoice.language.title')} 
                footer={t('settingsVoice.language.footer', { count: filteredLanguages.length })}
            >
                {filteredLanguages.length > 0 ? (
                    filteredLanguages.map((item) => (
                        <Item
                            key={item.code || 'autodetect'}
                            title={getLanguageDisplayName(item)}
                            subtitle={item.code || t('settingsVoice.language.autoDetect')}
                            rightElement={
                                voiceAssistantLanguage === item.code ? (
                                    <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                ) : null
                            }
                            onPress={() => handleLanguageSelect(item.code)}
                            showChevron={false}
                        />
                    ))
                ) : (
                    <Item
                        title={t('settingsVoice.language.noResults')}
                        subtitle={searchQuery || undefined}
                        showChevron={false}
                    />
                )}
            </ItemGroup>
        </ItemList>
    );
}
