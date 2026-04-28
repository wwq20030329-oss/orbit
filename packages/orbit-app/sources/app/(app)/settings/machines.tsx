import * as React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';

import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { t } from '@/text';

export default React.memo(() => {
    const router = useRouter();
    const { theme } = useUnistyles();
    const allMachines = useAllMachines();

    return (
        <ItemList>
            {allMachines.length > 0 ? (
                <ItemGroup title={t('settings.machines')}>
                    {[...allMachines].map((machine) => {
                        const isOnline = isMachineOnline(machine);
                        const host = machine.metadata?.host || 'Unknown';
                        const displayName = machine.metadata?.displayName;
                        const platform = machine.metadata?.platform || '';
                        const title = displayName || host;

                        let subtitle = '';
                        if (displayName && displayName !== host) {
                            subtitle = host;
                        }
                        if (platform) {
                            subtitle = subtitle ? `${subtitle} • ${platform}` : platform;
                        }
                        subtitle = subtitle
                            ? `${subtitle} • ${isOnline ? t('status.online') : t('status.offline')}`
                            : (isOnline ? t('status.online') : t('status.offline'));

                        return (
                            <Item
                                key={machine.id}
                                title={title}
                                subtitle={subtitle}
                                icon={(
                                    <Ionicons
                                        name="desktop-outline"
                                        size={24}
                                        color={isOnline ? theme.colors.status.connected : theme.colors.status.disconnected}
                                    />
                                )}
                                onPress={() => router.push(`/machine/${machine.id}`)}
                            />
                        );
                    })}
                </ItemGroup>
            ) : (
                <ItemGroup footer={t('settings.deviceSummary', { total: 0, online: 0 })}>
                    <Item
                        title={t('settings.machines')}
                        icon={<Ionicons name="desktop-outline" size={24} color={theme.colors.textSecondary} />}
                        showChevron={false}
                    />
                </ItemGroup>
            )}
        </ItemList>
    );
});
