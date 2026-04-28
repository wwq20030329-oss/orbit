import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { Session, GitStatus } from '@/sync/storageTypes';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSessionName, getSessionAvatarId, formatPathRelativeToHome } from '@/utils/sessionUtils';
import { Avatar } from './Avatar';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateDirectlyToSession, useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useOrbitAction } from '@/hooks/useOrbitAction';
import { OrbitError } from '@/utils/errors';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { sessionKill } from '@/sync/ops';
import { isWorktreePath, getRepoPath, getWorktreeName } from '@/utils/worktree';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { useRouter } from 'expo-router';
import { useSessionControlState } from '@/utils/sessionControlState';
import { useMachine, useSessionProjectGitStatus } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';

interface ActiveSessionsGroupProps {
    sessions: Session[];
    selectedSessionId?: string;
}

type SectionGitInfo = {
    branch: string | null;
    linesAdded: number;
    linesRemoved: number;
    hasChanges: boolean;
};

const EMPTY_SECTION_GIT_INFO: SectionGitInfo = {
    branch: null,
    linesAdded: 0,
    linesRemoved: 0,
    hasChanges: false,
};

function buildSectionGitInfo(gitStatus: GitStatus | null | undefined): SectionGitInfo {
    if (!gitStatus || gitStatus.lastUpdatedAt === 0) {
        return EMPTY_SECTION_GIT_INFO;
    }

    return {
        branch: gitStatus.branch,
        linesAdded: gitStatus.unstagedLinesAdded,
        linesRemoved: gitStatus.unstagedLinesRemoved,
        hasChanges: gitStatus.unstagedLinesAdded > 0 || gitStatus.unstagedLinesRemoved > 0,
    };
}

// Section header: avatar | path + branch + tree icon + line changes | + button
const SectionHeader = React.memo(({ session, displayPath }: { session: Session; displayPath: string }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const projectGitStatus = useSessionProjectGitStatus(session.id);
    const gitInfo = React.useMemo(
        () => buildSectionGitInfo(projectGitStatus),
        [projectGitStatus],
    );
    const draftActions = useNewSessionDraft(useShallow((state) => ({
        setMachineId: state.setMachineId,
        setPath: state.setPath,
        setSessionType: state.setSessionType,
    })));

    const sessionPath = session.metadata?.path || '';
    const isWorktree = isWorktreePath(sessionPath);
    const repoPath = isWorktree ? getRepoPath(sessionPath) : sessionPath;
    const repoDisplayPath = isWorktree
        ? formatPathRelativeToHome(repoPath, session.metadata?.homeDir)
        : displayPath;
    const worktreeName = isWorktree ? getWorktreeName(sessionPath) : null;
    const branchName = worktreeName || gitInfo.branch;
    const hasBranch = !!branchName;

    const avatarId = React.useMemo(() => getSessionAvatarId(session), [session]);

    const handleAdd = React.useCallback(() => {
        const machineId = session.metadata?.machineId;
        if (machineId) {
            draftActions.setMachineId(machineId);
        }
        // setMachineId resets path, so set path after
        const pathToSet = formatPathRelativeToHome(repoPath, session.metadata?.homeDir);
        draftActions.setPath(pathToSet);
        draftActions.setSessionType(isWorktree ? 'worktree' : 'simple');
        router.navigate('/new');
    }, [session.metadata, repoPath, isWorktree, draftActions, router]);

    return (
        <View style={hasBranch ? styles.sectionHeader : styles.sectionHeaderSingleLine}>
            {/* Avatar — vertically centered */}
            <View style={styles.sectionHeaderAvatar}>
                <Avatar id={avatarId} size={24} flavor={null} />
            </View>

            {/* Path + branch */}
            <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionHeaderPath} numberOfLines={1}>
                    {repoDisplayPath}
                </Text>
                {hasBranch && (
                    <View style={styles.branchRow}>
                        <Text style={styles.branchText} numberOfLines={1}>
                            {branchName}
                        </Text>
                        {isWorktree && (
                            <MaterialCommunityIcons
                                name="tree"
                                size={11}
                                color={theme.colors.textSecondary}
                                style={styles.worktreeIcon}
                            />
                        )}
                        {gitInfo.linesAdded > 0 && (
                            <Text style={styles.addedText}>+{gitInfo.linesAdded}</Text>
                        )}
                        {gitInfo.linesRemoved > 0 && (
                            <Text style={styles.removedText}>-{gitInfo.linesRemoved}</Text>
                        )}
                    </View>
                )}
            </View>

            {/* + button — vertically centered, large hit area */}
            <Pressable
                onPress={handleAdd}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={styles.addButton}
            >
                <Ionicons name="add-outline" size={14} color={theme.colors.textSecondary} />
            </Pressable>
        </View>
    );
});

// Full-width separator between machine groups: ——— 🖥 name ———
const MachineSeparator = React.memo(({ fallbackName, machineId }: { fallbackName: string; machineId: string }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const machine = useMachine(machineId);
    const machineName = machine?.metadata?.displayName
        || machine?.metadata?.host
        || fallbackName;

    const handlePress = React.useCallback(() => {
        router.navigate(`/machine/${machineId}` as any);
    }, [router, machineId]);

    return (
        <Pressable onPress={handlePress} style={styles.machineSeparator} hitSlop={{ top: 8, bottom: 8 }}>
            <View style={styles.machineSeparatorLine} />
            <Ionicons name="desktop-outline" size={11} color={theme.colors.textSecondary} style={{ marginHorizontal: 6 }} />
            <Text style={styles.machineSeparatorText} numberOfLines={1}>
                {machineName}
            </Text>
            <View style={styles.machineSeparatorLine} />
        </Pressable>
    );
});

function ActiveSessionsGroupCompactView({ sessions, selectedSessionId }: ActiveSessionsGroupProps) {
    const styles = stylesheet;

    // Group sessions by machine, then by project within each machine
    const { machineGroups, hasMultipleMachines } = React.useMemo(() => {
        const unknownText = t('status.unknown');
        const byMachine = new Map<string, {
            machineId: string;
            machineName: string;
            sortedProjects?: Array<{
                projectPath: string;
                displayPath: string;
                sessions: Session[];
            }>;
            projects: Map<string, {
                displayPath: string;
                sessions: Session[];
            }>;
        }>();

        sessions.forEach(session => {
            const machineId = session.metadata?.machineId || unknownText;
            const machineName = session.metadata?.host
                || (machineId !== unknownText ? machineId : `<${unknownText}>`);

            let machineGroup = byMachine.get(machineId);
            if (!machineGroup) {
                machineGroup = { machineId, machineName, projects: new Map() };
                byMachine.set(machineId, machineGroup);
            }

            const projectPath = session.metadata?.path || '';
            let projectGroup = machineGroup.projects.get(projectPath);
            if (!projectGroup) {
                const displayPath = formatPathRelativeToHome(projectPath, session.metadata?.homeDir);
                projectGroup = { displayPath, sessions: [] };
                machineGroup.projects.set(projectPath, projectGroup);
            }

            projectGroup.sessions.push(session);
        });

        // Sort sessions within each project group
        byMachine.forEach(mg => {
            mg.projects.forEach(pg => {
                pg.sessions.sort((a, b) => b.createdAt - a.createdAt);
            });
            mg.sortedProjects = Array.from(mg.projects.entries())
                .map(([projectPath, projectGroup]) => ({
                    projectPath,
                    displayPath: projectGroup.displayPath,
                    sessions: projectGroup.sessions,
                }))
                .sort((left, right) => left.displayPath.localeCompare(right.displayPath));
        });

        const sorted = Array.from(byMachine.values()).sort((a, b) =>
            a.machineName.localeCompare(b.machineName)
        );

        return { machineGroups: sorted, hasMultipleMachines: byMachine.size > 1 };
    }, [sessions]);

    return (
        <View style={styles.container}>
            {machineGroups.map(machineGroup => {
                return (
                    <React.Fragment key={machineGroup.machineId}>
                        {hasMultipleMachines && (
                            <MachineSeparator
                                fallbackName={machineGroup.machineName}
                                machineId={machineGroup.machineId}
                            />
                        )}
                        {machineGroup.sortedProjects?.map((projectGroup) => {
                            const firstSession = projectGroup.sessions[0];
                            if (!firstSession) return null;

                            return (
                                <View key={projectGroup.projectPath}>
                                    <SectionHeader
                                        session={firstSession}
                                        displayPath={projectGroup.displayPath}
                                    />
                                    <View style={styles.projectCard}>
                                        {projectGroup.sessions.map((session, index) => (
                                            <CompactSessionRow
                                                key={session.id}
                                                session={session}
                                                selected={selectedSessionId === session.id}
                                                showBorder={index < projectGroup.sessions.length - 1}
                                            />
                                        ))}
                                    </View>
                                </View>
                            );
                        })}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

export const ActiveSessionsGroupCompact = React.memo(ActiveSessionsGroupCompactView);

// Compact session row with status dot indicator
const CompactSessionRow = React.memo(({ session, selected, showBorder }: { session: Session; selected?: boolean; showBorder?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const sessionControlState = useSessionControlState(session, { sessionId: session.id });
    const sessionStatus = sessionControlState.status;
    const sessionName = getSessionName(session);
    const navigateToSession = useNavigateToSession();
    const navigateDirectlyToSession = useNavigateDirectlyToSession();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = true;
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);

    const [archivingSession, performArchive] = useOrbitAction(async () => {
        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new OrbitError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        performArchive();
    }, [performArchive]);

    const [openingSession, performOpenSession] = useOrbitAction(async () => {
        await navigateToSession(session.id);
    });

    const handlePress = React.useCallback(() => {
        performOpenSession();
    }, [performOpenSession]);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const itemContent = (
        <Pressable
            style={[
                styles.sessionRow,
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected
            ]}
            onPress={handlePress}
        >
            <View style={styles.sessionContent}>
                <View style={styles.sessionTitleRow}>
                    {/* Left indicator: status dot or draft icon */}
                    {(() => {
                        // Show draft icon when online with draft
                        if (sessionStatus.state === 'waiting' && session.draft) {
                            return (
                                <Ionicons
                                    name="create-outline"
                                    size={14}
                                    color={theme.colors.textSecondary}
                                    style={{ marginRight: 8 }}
                                />
                            );
                        }

                        // Show status dot for permission_required/thinking states
                        if (sessionStatus.state === 'permission_required' || sessionStatus.state === 'thinking') {
                            return (
                                <View style={[styles.statusDotContainer, { marginRight: 8 }]}>
                                    <StatusDot color={sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} />
                                </View>
                            );
                        }

                        // Show grey dot for online without draft
                        if (sessionStatus.state === 'waiting') {
                            return (
                                <View style={[styles.statusDotContainer, { marginRight: 8 }]}>
                                    <StatusDot color={theme.colors.textSecondary} isPulsing={false} />
                                </View>
                            );
                        }

                        return null;
                    })()}

                    {openingSession && (
                        <Ionicons
                            name="refresh-outline"
                            size={14}
                            color={theme.colors.textSecondary}
                            style={{ marginRight: 8 }}
                        />
                    )}

                    <Text
                        style={[
                            styles.sessionTitle,
                            sessionControlState.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                        ]}
                        numberOfLines={2}
                    >
                        {sessionName}
                    </Text>
                </View>
            </View>
        </Pressable>
    );

    if (!swipeEnabled) {
        return (
            <>
                {itemContent}
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    session={session}
                    visible={!!actionsAnchor}
                />
            </>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleArchive}
            disabled={archivingSession}
        >
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.archiveSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archivingSession}
        >
            {itemContent}
        </Swipeable>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
    // Section header styles
    sectionHeader: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderSingleLine: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderAvatar: {
        marginRight: 8,
    },
    sectionHeaderContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sectionHeaderPath: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 13, default: 14 }),
        lineHeight: Platform.select({ ios: 18, default: 20 }),
        letterSpacing: Platform.select({ ios: -0.08, default: 0.1 }),
        fontWeight: Platform.select({ ios: 'normal', default: '500' }),
    },
    branchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 1,
    },
    branchText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        flexShrink: 1,
    },
    worktreeIcon: {
        marginLeft: 4,
    },
    addedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.gitAddedText,
        marginLeft: 6,
    },
    removedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.gitRemovedText,
        marginLeft: 3,
    },
    addButton: {
        marginLeft: 4,
        padding: 8,
    },
    // Machine separator styles
    machineSeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        paddingTop: 8,
        paddingBottom: 0,
    },
    machineSeparatorLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    machineSeparatorText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        marginRight: 4,
    },
    // Project card styles
    projectCard: {
        backgroundColor: theme.colors.surface,
        marginBottom: 8,
        marginHorizontal: Platform.select({ ios: 16, default: 12 }),
        borderRadius: Platform.select({ ios: 10, default: 16 }),
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    // Session row styles
    sessionRow: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionTitle: {
        fontSize: 15,
        flex: 1,
        ...Typography.default('regular'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));
