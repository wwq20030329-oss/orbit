import * as React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '../StatusDot';
import { t } from '@/text';

interface AgentInputStatusProps {
    connectionStatus?: {
        text: string;
        color: string;
        dotColor: string;
        isPulsing?: boolean;
        cliStatus?: {
            claude: boolean | null;
            codex: boolean | null;
            gemini?: boolean | null;
        };
    };
    contextWarning: { text: string; color: string } | null;
    displayPermissionMode: any;
    permissionModeKey: string;
    isSandboxedYoloMode: boolean;
    withSandboxSuffix: (label: string, modeKey?: string) => string;
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 4,
        minHeight: 20,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 11,
    },
    statusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statusText: {
        fontSize: 11,
        ...Typography.default(),
    },
    permissionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
}));

export const AgentInputStatus = React.memo((props: AgentInputStatusProps) => {
    const { 
        connectionStatus, 
        contextWarning, 
        displayPermissionMode, 
        permissionModeKey, 
        isSandboxedYoloMode,
        withSandboxSuffix 
    } = props;
    const { theme } = useUnistyles();
    const styles = stylesheet;

    if (!connectionStatus && !contextWarning && (!displayPermissionMode || permissionModeKey === 'default')) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {connectionStatus && (
                    <>
                        <View style={styles.statusItem}>
                            <StatusDot
                                color={connectionStatus.dotColor}
                                isPulsing={connectionStatus.isPulsing}
                                size={6}
                            />
                            <Text style={[styles.statusText, { color: connectionStatus.color }]}>
                                {connectionStatus.text}
                            </Text>
                        </View>
                        {connectionStatus.cliStatus && (
                            <>
                                {(['claude', 'codex', 'gemini'] as const).map(agent => {
                                    const status = connectionStatus.cliStatus?.[agent];
                                    if (status === undefined) return null;
                                    const color = status ? theme.colors.success : theme.colors.textDestructive;
                                    return (
                                        <View key={agent} style={styles.statusItem}>
                                            <Text style={[styles.statusText, { color }]}>
                                                {status ? '✓' : '✗'}
                                            </Text>
                                            <Text style={[styles.statusText, { color }]}>
                                                {agent}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </>
                )}
                {contextWarning && (
                    <Text style={[
                        styles.statusText, 
                        { 
                            color: contextWarning.color,
                            marginLeft: connectionStatus ? 8 : 0,
                        }
                    ]}>
                        {connectionStatus ? '• ' : ''}{contextWarning.text}
                    </Text>
                )}
            </View>

            {displayPermissionMode && permissionModeKey !== 'default' && (() => {
                const permColor = isSandboxedYoloMode ? '#4169E1' :
                    permissionModeKey === 'acceptEdits' ? theme.colors.permission.acceptEdits :
                        permissionModeKey === 'bypassPermissions' ? theme.colors.permission.bypass :
                            permissionModeKey === 'plan' ? theme.colors.permission.plan :
                                permissionModeKey === 'read-only' ? theme.colors.permission.readOnly :
                                    permissionModeKey === 'safe-yolo' ? theme.colors.permission.safeYolo :
                                        permissionModeKey === 'yolo' ? theme.colors.permission.yolo :
                                            theme.colors.textSecondary;
                
                const permIcon: 'play-forward' | 'pause' =
                    permissionModeKey === 'plan' || permissionModeKey === 'read-only'
                        ? 'pause' : 'play-forward';

                return (
                    <View style={styles.permissionBadge}>
                        <Ionicons name={permIcon} size={11} color={permColor} />
                        <Text style={[styles.statusText, { color: permColor }]}>
                            {withSandboxSuffix(displayPermissionMode.name, permissionModeKey)}
                        </Text>
                    </View>
                );
            })()}
        </View>
    );
});
