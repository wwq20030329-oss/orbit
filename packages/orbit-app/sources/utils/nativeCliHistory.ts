import type { SessionListViewItem } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry, NativeCliTool, Session } from '@/sync/storageTypes';
import type { Message } from '@/sync/typesMessage';

import { isSessionLikelyOnline } from './presence';
import { WORKTREE_PATH_MARKER, getRepoPath, getWorktreeName, isWorktreePath } from './worktree';

export type SessionListCliTool = NativeCliTool | 'other';

type GroupedListItem =
    | { type: 'session'; session: Session; updatedAt: number }
    | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; updatedAt: number };

interface BuildCliSessionListViewDataOptions {
    sessions: Session[];
    entries: NativeCliHistoryEntry[];
    allEntries?: NativeCliHistoryEntry[];
    machinesById: Record<string, Machine>;
    collapsedSections: Record<string, boolean>;
    collapsedProjectGroups: Record<string, boolean>;
    hiddenEntryKeys?: Set<string>;
    hideInactiveSessions?: boolean;
}

interface ProjectDescriptor {
    groupKey: string;
    title: string;
    subtitle: string;
    updatedAt: number;
    items: GroupedListItem[];
}

interface SessionPresentation {
    title: string;
    subtitle: string;
    badgeLabel: 'Live' | 'Recovered' | 'Orbit' | 'History';
    badgeTone: 'live' | 'history' | 'orbit';
}

export interface NativeCliEntryStatusPresentation {
    text: string;
    color: string;
    isPulsing: boolean;
    isConnected: boolean;
}

const toolOrder: SessionListCliTool[] = ['claude', 'codex', 'gemini', 'other'];

export function buildCliSessionListViewData({
    sessions,
    entries,
    allEntries = entries,
    machinesById,
    collapsedSections,
    collapsedProjectGroups,
    hiddenEntryKeys = new Set<string>(),
    hideInactiveSessions = false,
}: BuildCliSessionListViewDataOptions): SessionListViewItem[] {
    const rawNativeEntriesByKey = buildNativeEntriesByKey(filterVisibleNativeEntries(allEntries, hiddenEntryKeys));
    const sections = new Map<SessionListCliTool, GroupedListItem[]>();
    const dedupedSessions = dedupeCliSessionsForList(sessions, rawNativeEntriesByKey);
    const visibleEntries = mergeNativeEntriesWithSessionFallbacks(entries, dedupedSessions, hiddenEntryKeys);
    const visibleAllEntries = mergeNativeEntriesWithSessionFallbacks(allEntries, dedupedSessions, hiddenEntryKeys);
    const nativeEntriesByKey = buildNativeEntriesByKey(visibleAllEntries);

    for (const tool of toolOrder) {
        sections.set(tool, []);
    }

    for (const entry of visibleEntries) {
        sections.get(entry.tool)?.push({
            type: 'native-cli-session',
            entry,
            updatedAt: entry.updatedAt,
        });
    }

    const items: SessionListViewItem[] = [];

    for (const tool of toolOrder) {
        const sectionItems = sections.get(tool) ?? [];
        if (sectionItems.length === 0) {
            continue;
        }

        const projectGroups = buildProjectGroups(sectionItems, machinesById, nativeEntriesByKey);
        const expanded = collapsedSections[tool] !== true;

        items.push({
            type: 'cli-section',
            tool,
            title: getCliSectionTitle(tool),
            count: sectionItems.length,
            projectCount: projectGroups.length,
            expanded,
        });

        if (!expanded) {
            continue;
        }

        for (const projectGroup of projectGroups) {
            const collapseKey = getCliProjectCollapseKey(tool, projectGroup.groupKey);
            const projectExpanded = collapsedProjectGroups[collapseKey] !== true;

            items.push({
                type: 'cli-project-group',
                tool,
                title: projectGroup.title,
                subtitle: projectGroup.subtitle,
                groupKey: projectGroup.groupKey,
                count: projectGroup.items.length,
                expanded: projectExpanded,
            });

            if (!projectExpanded) {
                continue;
            }

            for (const item of projectGroup.items) {
                if (item.type === 'session') {
                    const presentation = getSessionPresentation(item.session, nativeEntriesByKey);
                    items.push({
                        type: 'session',
                        session: item.session,
                        displayTitle: presentation.title,
                        displaySubtitle: presentation.subtitle,
                        badgeLabel: presentation.badgeLabel,
                        badgeTone: presentation.badgeTone,
                    });
                    continue;
                }

                const presentation = getNativeEntryPresentation(item.entry);
                items.push({
                    type: 'native-cli-session',
                    entry: item.entry,
                    displayTitle: presentation.title,
                    displaySubtitle: presentation.subtitle,
                    badgeLabel: presentation.badgeLabel,
                    badgeTone: presentation.badgeTone,
                });
            }
        }
    }

    return items;
}

export function getCliProjectCollapseKey(tool: SessionListCliTool, groupKey: string): string {
    return `${tool}:${groupKey}`;
}

function flattenNativeCliHistory(
    nativeCliHistoryByMachine: Record<string, NativeCliHistoryEntry[]> | undefined,
): NativeCliHistoryEntry[] {
    if (!nativeCliHistoryByMachine) {
        return [];
    }

    return Object.values(nativeCliHistoryByMachine).flat();
}

function buildProjectGroups(
    sectionItems: GroupedListItem[],
    machinesById: Record<string, Machine>,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): ProjectDescriptor[] {
    const groups = new Map<string, ProjectDescriptor>();

    for (const item of sectionItems) {
        const descriptor = getProjectDescriptor(item, machinesById, nativeEntriesByKey);
        const existing = groups.get(descriptor.groupKey);

        if (existing) {
            existing.items.push(item);
            existing.updatedAt = Math.max(existing.updatedAt, descriptor.updatedAt);
            continue;
        }

        groups.set(descriptor.groupKey, {
            ...descriptor,
            items: [item],
        });
    }

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            items: group.items.sort(compareGroupedItems),
        }))
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

function shouldShowCliSession(
    session: Session,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): boolean {
    if (isInternalCliMirrorSession(session)) {
        return false;
    }

    const tool = getSessionCliTool(session);
    const backendId = getSessionBackendId(session);
    const projectTitle = getProjectTitle(session.metadata?.path || session.metadata?.projectRoot || '');
    const summaryTitle = pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);
    const startedByDaemon = session.metadata?.startedBy === 'daemon' || session.metadata?.startedFromDaemon === true;
    const importedHistory = hasImportedNativeHistoryForSession(session, tool, backendId);
    if (tool === 'other') {
        return true;
    }

    if (canRepresentSessionAsNativeEntry(session)) {
        return false;
    }

    const hasNativeMatch = findNativeEntryForSession(session, nativeEntriesByKey) !== null;
    if (hasNativeMatch) {
        return false;
    }

    if (startedByDaemon && !summaryTitle && !importedHistory) {
        return false;
    }

    if (isSessionLikelyOnline(session)) {
        return true;
    }

    if (session.metadata?.lifecycleState === 'running') {
        return true;
    }

    return false;
}

function dedupeCliSessionsForList(
    sessions: Session[],
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): Session[] {
    const groupedSessions = new Map<string, Session[]>();

    for (const session of sessions) {
        const groupKey = getCliSessionGroupKey(session);
        const existing = groupedSessions.get(groupKey);
        if (existing) {
            existing.push(session);
            continue;
        }
        groupedSessions.set(groupKey, [session]);
    }

    return Array.from(groupedSessions.values()).map((group) =>
        pickPrimaryCliSession(group, nativeEntriesByKey),
    );
}

function mergeNativeEntriesWithSessionFallbacks(
    entries: NativeCliHistoryEntry[],
    sessions: Session[],
    hiddenEntryKeys: Set<string> = new Set<string>(),
): NativeCliHistoryEntry[] {
    const mergedEntries = new Map<string, NativeCliHistoryEntry>();

    for (const entry of filterVisibleNativeEntries(entries, hiddenEntryKeys)) {
        mergedEntries.set(getNativeEntryLookupKey(entry.tool, entry.backendId), entry);
    }

    for (const session of sessions) {
        const fallbackEntry = buildNativeEntryFromSession(session);
        if (!fallbackEntry) {
            continue;
        }

        if (hiddenEntryKeys.has(getNativeCliEntrySourceKey(fallbackEntry))) {
            continue;
        }

        const key = getNativeEntryLookupKey(fallbackEntry.tool, fallbackEntry.backendId);
        if (!mergedEntries.has(key)) {
            mergedEntries.set(key, fallbackEntry);
        }
    }

    return Array.from(mergedEntries.values())
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

function buildNativeEntryFromSession(session: Session): NativeCliHistoryEntry | null {
    if (!canRepresentSessionAsNativeEntry(session)) {
        return null;
    }

    const tool = getSessionCliTool(session);
    const backendId = getSessionBackendId(session);
    const machineId = session.metadata?.machineId;
    const workingDirectory = session.metadata?.path || session.metadata?.projectRoot || null;
    const projectTitle = getProjectTitle(workingDirectory ?? '');
    const titleFromSummary = pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);
    const hasImportedHistory = hasImportedNativeHistoryForSession(session, tool, backendId);
    const isLiveSession = isSessionLikelyOnline(session);
    const startedByDaemon = session.metadata?.startedBy === 'daemon' || session.metadata?.startedFromDaemon === true;

    if (tool === 'other' || !backendId || !machineId || !workingDirectory) {
        return null;
    }

    if (!titleFromSummary && !hasImportedHistory && (!isLiveSession || startedByDaemon)) {
        return null;
    }

    const title = titleFromSummary
        || projectTitle
        || buildFallbackSessionTitle(session, tool);
    const summary = title === session.metadata?.summary?.text
        ? null
        : pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);

    return {
        id: `${tool}:session:${session.id}`,
        tool,
        backendId,
        machineId,
        workingDirectory,
        projectRoot: session.metadata?.projectRoot,
        title,
        summary,
        updatedAt: session.updatedAt,
        isLive: isSessionLikelyOnline(session),
    };
}

function getCliSessionGroupKey(session: Session): string {
    const tool = getSessionCliTool(session);
    if (tool === 'claude' && session.metadata?.claudeSessionId) {
        return `claude:${session.metadata.claudeSessionId}`;
    }
    if (tool === 'codex' && session.metadata?.codexThreadId) {
        return `codex:${session.metadata.codexThreadId}`;
    }
    if (tool === 'gemini' && session.metadata?.geminiSessionId) {
        return `gemini:${session.metadata.geminiSessionId}`;
    }
    return `orbit:${session.id}`;
}

function pickPrimaryCliSession(
    sessions: Session[],
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): Session {
    return [...sessions].sort((left, right) => compareCliSessions(left, right, nativeEntriesByKey))[0] ?? sessions[0]!;
}

function compareCliSessions(
    left: Session,
    right: Session,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): number {
    const leftInternalMirror = isInternalCliMirrorSession(left);
    const rightInternalMirror = isInternalCliMirrorSession(right);
    if (leftInternalMirror !== rightInternalMirror) {
        return leftInternalMirror ? 1 : -1;
    }

    const leftMatchesNative = findNativeEntryForSession(left, nativeEntriesByKey) !== null;
    const rightMatchesNative = findNativeEntryForSession(right, nativeEntriesByKey) !== null;
    if (leftMatchesNative !== rightMatchesNative) {
        return leftMatchesNative ? -1 : 1;
    }

    const leftOnline = isSessionLikelyOnline(left);
    const rightOnline = isSessionLikelyOnline(right);
    if (leftOnline !== rightOnline) {
        return leftOnline ? -1 : 1;
    }

    const leftStartedByDaemon = left.metadata?.startedBy === 'daemon' || left.metadata?.startedFromDaemon === true;
    const rightStartedByDaemon = right.metadata?.startedBy === 'daemon' || right.metadata?.startedFromDaemon === true;
    if (leftStartedByDaemon !== rightStartedByDaemon) {
        return leftStartedByDaemon ? 1 : -1;
    }

    const leftRunning = left.metadata?.lifecycleState === 'running';
    const rightRunning = right.metadata?.lifecycleState === 'running';
    if (leftRunning !== rightRunning) {
        return leftRunning ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.id.localeCompare(right.id);
}

function compareGroupedItems(left: GroupedListItem, right: GroupedListItem): number {
    const priorityDelta = getGroupedItemPriority(left) - getGroupedItemPriority(right);
    if (priorityDelta !== 0) {
        return priorityDelta;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    if (left.type !== right.type) {
        return left.type === 'session' ? -1 : 1;
    }

    return 0;
}

function getGroupedItemPriority(item: GroupedListItem): number {
    if (item.type === 'session' && isSessionLikelyOnline(item.session)) {
        return 0;
    }

    if (item.type === 'native-cli-session' && item.entry.isLive) {
        return 1;
    }

    if (item.type === 'session') {
        return 2;
    }

    return 3;
}

function getProjectDescriptor(
    item: GroupedListItem,
    machinesById: Record<string, Machine>,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): ProjectDescriptor {
    if (item.type === 'native-cli-session') {
        const machine = machinesById[item.entry.machineId];
        const projectPath = getNativeEntryProjectPath(item.entry);
        const relativePath = formatPathRelativeToHome(projectPath, machine?.metadata?.homeDir);
        const machineLabel = machine?.metadata?.displayName || machine?.metadata?.host || item.entry.machineId;
        return {
            groupKey: `${item.entry.machineId}:${projectPath}`,
            title: getProjectTitle(projectPath),
            subtitle: `${relativePath} · ${machineLabel}`,
            updatedAt: item.updatedAt,
            items: [],
        };
    }

    const machineId = item.session.metadata?.machineId ?? 'unknown-machine';
    const machine = item.session.metadata?.machineId ? machinesById[item.session.metadata.machineId] : null;
    const machineLabel = machine?.metadata?.displayName
        || machine?.metadata?.host
        || item.session.metadata?.host
        || machineId;
    const matchingNativeEntry = findNativeEntryForSession(item.session, nativeEntriesByKey);
    const sessionPath = getSessionProjectPath(item.session, matchingNativeEntry);
    const homeDir = item.session.metadata?.homeDir || machine?.metadata?.homeDir;

    if (!sessionPath) {
        return {
            groupKey: `${machineId}:no-project`,
            title: 'No Project',
            subtitle: machineLabel,
            updatedAt: item.updatedAt,
            items: [],
        };
    }

    return {
        groupKey: `${machineId}:${sessionPath}`,
        title: getProjectTitle(sessionPath),
        subtitle: `${formatPathRelativeToHome(sessionPath, homeDir)} · ${machineLabel}`,
        updatedAt: item.updatedAt,
        items: [],
    };
}

function buildNativeEntriesByKey(entries: NativeCliHistoryEntry[]): Map<string, NativeCliHistoryEntry[]> {
    const map = new Map<string, NativeCliHistoryEntry[]>();

    for (const entry of entries) {
        const key = getNativeEntryLookupKey(entry.tool, entry.backendId);
        const existing = map.get(key);
        if (existing) {
            existing.push(entry);
            continue;
        }

        map.set(key, [entry]);
    }

    for (const [, values] of map) {
        values.sort((left, right) => right.updatedAt - left.updatedAt);
    }

    return map;
}

function getNativeEntryLookupKey(tool: SessionListCliTool, backendId: string): string {
    return `${tool}:${backendId}`;
}

function findNativeEntryForSession(
    session: Session,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): NativeCliHistoryEntry | null {
    const singleSessionMap = { [session.id]: session };
    const entriesByRecency = Array.from(nativeEntriesByKey.values())
        .flat()
        .sort((left, right) => right.updatedAt - left.updatedAt);
    const matchedEntry = entriesByRecency.find((entry) => {
        return findExistingOrbitSessionIdForNativeEntry(entry, singleSessionMap) === session.id;
    });
    if (matchedEntry) {
        return matchedEntry;
    }

    const machineId = session.metadata?.machineId ?? null;
    const sessionPath = session.metadata?.path ?? null;
    const candidates = getSessionBackendCandidates(session)
        .flatMap(({ tool, backendId }) => nativeEntriesByKey.get(getNativeEntryLookupKey(tool, backendId)) ?? []);
    const sessionProjectPath = getSessionProjectPath(session);

    if (candidates.length === 0) {
        return null;
    }

    const exactMachineAndPathMatch = candidates.find((entry) => {
        if (!machineId || !sessionPath) {
            return false;
        }
        return entry.machineId === machineId && entry.workingDirectory === sessionPath;
    });
    if (exactMachineAndPathMatch) {
        return exactMachineAndPathMatch;
    }

    const exactPathMatch = candidates.find((entry) => sessionPath && entry.workingDirectory === sessionPath);
    if (exactPathMatch) {
        return exactPathMatch;
    }

    const exactMachineAndProjectMatch = candidates.find((entry) => {
        if (!machineId || !sessionProjectPath) {
            return false;
        }
        return entry.machineId === machineId && getNativeEntryProjectPath(entry) === sessionProjectPath;
    });
    if (exactMachineAndProjectMatch) {
        return exactMachineAndProjectMatch;
    }

    const exactProjectMatch = candidates.find((entry) =>
        sessionProjectPath ? getNativeEntryProjectPath(entry) === sessionProjectPath : false,
    );
    if (exactProjectMatch) {
        return exactProjectMatch;
    }

    const exactMachineMatch = candidates.find((entry) => machineId && entry.machineId === machineId);
    if (exactMachineMatch) {
        return exactMachineMatch;
    }

    return candidates[0] ?? null;
}

export function findMatchingNativeCliEntryForSession(
    session: Session,
    nativeCliHistoryByMachine: Record<string, NativeCliHistoryEntry[]> | undefined,
): NativeCliHistoryEntry | null {
    const entries = flattenNativeCliHistory(nativeCliHistoryByMachine);
    if (entries.length === 0) {
        return null;
    }

    return findNativeEntryForSession(session, buildNativeEntriesByKey(entries));
}

function getSessionBackendCandidates(session: Session): Array<{ tool: SessionListCliTool; backendId: string }> {
    const candidates: Array<{ tool: SessionListCliTool; backendId: string }> = [];
    const seen = new Set<string>();

    const pushCandidate = (tool: SessionListCliTool, backendId: string | null | undefined) => {
        if (tool === 'other' || !backendId) {
            return;
        }

        const key = `${tool}:${backendId}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        candidates.push({ tool, backendId });
    };

    if (session.metadata?.claudeSessionId) {
        pushCandidate('claude', session.metadata.claudeSessionId);
    }
    if (session.metadata?.codexThreadId) {
        pushCandidate('codex', session.metadata.codexThreadId);
    }
    if (session.metadata?.geminiSessionId) {
        pushCandidate('gemini', session.metadata.geminiSessionId);
    }
    if (session.metadata?.nativeHistorySourceTool && session.metadata?.nativeHistorySourceBackendId) {
        pushCandidate(session.metadata.nativeHistorySourceTool, session.metadata.nativeHistorySourceBackendId);
    }

    return candidates;
}

function getSessionBackendId(session: Session): string | null {
    return session.metadata?.claudeSessionId
        ?? session.metadata?.codexThreadId
        ?? session.metadata?.geminiSessionId
        ?? session.metadata?.nativeHistorySourceBackendId
        ?? null;
}

function hasSessionBackendId(session: Session): boolean {
    return getSessionBackendId(session) !== null;
}

function canRepresentSessionAsNativeEntry(session: Session): boolean {
    return !isInternalCliMirrorSession(session)
        && getSessionCliTool(session) !== 'other'
        && hasSessionBackendId(session)
        && Boolean(session.metadata?.machineId)
        && Boolean(session.metadata?.path || session.metadata?.projectRoot)
        && session.metadata?.lifecycleState !== 'archived';
}

function getSessionPresentation(
    session: Session,
    nativeEntriesByKey: Map<string, NativeCliHistoryEntry[]>,
): SessionPresentation {
    const tool = getSessionCliTool(session);
    const projectTitle = getProjectTitle(session.metadata?.path || session.metadata?.projectRoot || '');
    const matchingNativeEntry = findNativeEntryForSession(session, nativeEntriesByKey);
    const summaryTitle = pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);
    const nativeTitle = pickMeaningfulLabel(matchingNativeEntry?.title, projectTitle);
    const fallbackTitle = buildFallbackSessionTitle(session, tool);
    const title = summaryTitle || nativeTitle || projectTitle || fallbackTitle;

    const subtitleParts: string[] = [];
    const secondaryLabel = title === summaryTitle
        ? pickMeaningfulLabel(matchingNativeEntry?.summary ?? matchingNativeEntry?.title, projectTitle)
        : pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);
    if (secondaryLabel && secondaryLabel !== title) {
        subtitleParts.push(secondaryLabel);
    }

    subtitleParts.push(`ID ${getShortBackendOrSessionId(session)}`);
    subtitleParts.push(formatRelativeUpdatedAt(session.updatedAt));

    if (matchingNativeEntry?.isLive) {
        return {
            title,
            subtitle: subtitleParts.join(' · '),
            badgeLabel: 'Live',
            badgeTone: 'live',
        };
    }

    if (matchingNativeEntry) {
        return {
            title,
            subtitle: subtitleParts.join(' · '),
            badgeLabel: 'Recovered',
            badgeTone: 'history',
        };
    }

    return {
        title,
        subtitle: subtitleParts.join(' · '),
        badgeLabel: 'Orbit',
        badgeTone: 'orbit',
    };
}

export function getSessionDisplayTitle(
    session: Session,
    nativeCliHistoryByMachine?: Record<string, NativeCliHistoryEntry[]>,
): string {
    const matchingNativeEntry = findMatchingNativeCliEntryForSession(session, nativeCliHistoryByMachine);
    const tool = getSessionCliTool(session);
    const projectTitle = getProjectTitle(
        session.metadata?.path
        || session.metadata?.projectRoot
        || matchingNativeEntry?.workingDirectory
        || '',
    );
    const summaryTitle = pickMeaningfulLabel(session.metadata?.summary?.text, projectTitle);
    const nativeTitle = pickMeaningfulLabel(matchingNativeEntry?.title, projectTitle);
    const explicitName = pickMeaningfulLabel(session.metadata?.name, projectTitle);

    return summaryTitle
        || nativeTitle
        || explicitName
        || projectTitle
        || buildFallbackSessionTitle(session, tool);
}

function getNativeEntryPresentation(entry: NativeCliHistoryEntry): SessionPresentation {
    const projectTitle = getProjectTitle(entry.workingDirectory);
    const preferredTitle = pickMeaningfulLabel(entry.title, projectTitle);
    const title = preferredTitle || projectTitle || buildFallbackNativeTitle(entry);
    const subtitleParts: string[] = [];
    const secondaryLabel = pickMeaningfulLabel(entry.summary, title);

    if (secondaryLabel && secondaryLabel !== title) {
        subtitleParts.push(secondaryLabel);
    }

    subtitleParts.push(`ID ${getShortId(entry.backendId)}`);
    subtitleParts.push(formatRelativeUpdatedAt(entry.updatedAt));

    return {
        title,
        subtitle: subtitleParts.join(' · '),
        badgeLabel: entry.isLive ? 'Live' : 'History',
        badgeTone: entry.isLive ? 'live' : 'history',
    };
}

export function getNativeCliEntryStatusPresentation(
    entry: Pick<NativeCliHistoryEntry, 'isLive'>,
    machineLabel: string,
): NativeCliEntryStatusPresentation {
    if (entry.isLive) {
        return {
            text: `Live on ${machineLabel}`,
            color: '#34C759',
            isPulsing: true,
            isConnected: true,
        };
    }

    return {
        text: `History on ${machineLabel}`,
        color: '#8E8E93',
        isPulsing: false,
        isConnected: false,
    };
}

function pickMeaningfulLabel(value: string | null | undefined, projectTitle: string): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
        return null;
    }

    const normalized = trimmed.toLowerCase();
    const normalizedProject = projectTitle.trim().toLowerCase();
    if (!normalizedProject) {
        return trimmed;
    }

    if (normalized === normalizedProject) {
        return null;
    }

    if (normalized === 'untitled session' || normalized === 'unknown' || normalized === 'new session') {
        return null;
    }

    if (isTrivialPromptTitle(normalized)) {
        return null;
    }

    return trimmed;
}

function isTrivialPromptTitle(value: string): boolean {
    const exactMatches = [
        'hello',
        'hi',
        'hey',
        'test',
        'testing',
        '你好',
        '您好',
        '嗨',
        '测试',
    ];

    if (exactMatches.includes(value)) {
        return true;
    }

    const promptLikePrefixes = [
        'hello',
        'hi',
        'hey',
        'test',
        'testing',
        '你好',
        '您好',
        '嗨',
        '测试',
    ];

    const hasPromptLikePrefix = promptLikePrefixes.some((prefix) => (
        value.startsWith(`${prefix} `)
        || value.startsWith(`${prefix},`)
        || value.startsWith(`${prefix}.`)
        || value.startsWith(`${prefix}:`)
        || value.startsWith(`${prefix}?`)
        || value.startsWith(`${prefix}!`)
        || value.startsWith(`${prefix}，`)
        || value.startsWith(`${prefix}。`)
        || value.startsWith(`${prefix}：`)
        || value.startsWith(`${prefix}？`)
        || value.startsWith(`${prefix}！`)
    ));

    if (!hasPromptLikePrefix) {
        return false;
    }

    return value.length <= 80;
}

function buildFallbackSessionTitle(session: Session, tool: SessionListCliTool): string {
    const toolLabel = getCliSectionTitle(tool);
    const shortId = getShortBackendOrSessionId(session);
    return `${toolLabel} Session · ${shortId}`;
}

function buildFallbackNativeTitle(entry: NativeCliHistoryEntry): string {
    return `${getCliSectionTitle(entry.tool)} Session · ${getShortId(entry.backendId)}`;
}

function getShortBackendOrSessionId(session: Session): string {
    const backendId = session.metadata?.claudeSessionId
        ?? session.metadata?.codexThreadId
        ?? session.metadata?.geminiSessionId
        ?? session.id;
    return getShortId(backendId);
}

function getShortId(value: string): string {
    return value.slice(0, 8);
}

function formatRelativeUpdatedAt(updatedAt: number): string {
    const diffMs = Math.max(0, Date.now() - updatedAt);
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return 'just now';
    }

    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }

    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    return `${diffDays}d ago`;
}

export function getCliSectionTitle(tool: SessionListCliTool): string {
    switch (tool) {
        case 'claude':
            return 'Claude';
        case 'codex':
            return 'Codex';
        case 'gemini':
            return 'Gemini';
        case 'other':
            return 'Other';
    }
}

export function getSessionCliTool(session: Session): SessionListCliTool {
    if (session.metadata?.codexThreadId || session.metadata?.flavor === 'codex') {
        return 'codex';
    }

    if (session.metadata?.geminiSessionId || session.metadata?.flavor === 'gemini') {
        return 'gemini';
    }

    if (session.metadata?.claudeSessionId || session.metadata?.flavor === 'claude') {
        return 'claude';
    }

    if (session.metadata?.nativeHistorySourceTool) {
        return session.metadata.nativeHistorySourceTool;
    }

    return 'other';
}

function getProjectTitle(workingDirectory: string): string {
    const normalized = workingDirectory.replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    return segments.at(-1) ?? workingDirectory;
}

function getNativeEntryProjectPath(entry: NativeCliHistoryEntry): string {
    return normalizeProjectPath(entry.projectRoot ?? entry.workingDirectory) ?? entry.workingDirectory;
}

function getSessionProjectPath(
    session: Session,
    matchingNativeEntry?: NativeCliHistoryEntry | null,
): string | null {
    return normalizeProjectPath(
        matchingNativeEntry?.projectRoot
        ?? session.metadata?.projectRoot
        ?? session.metadata?.path
        ?? null,
    );
}

function normalizeProjectPath(path: string | null | undefined): string | null {
    if (!path) {
        return null;
    }

    const normalized = path.replace(/\/+$/, '');
    if (!normalized) {
        return null;
    }

    if (!isWorktreePath(normalized)) {
        return normalized;
    }

    const repoPath = getRepoPath(normalized);
    const worktreeName = getWorktreeName(normalized);
    if (!repoPath || !worktreeName) {
        return normalized;
    }

    return `${repoPath}${WORKTREE_PATH_MARKER}${worktreeName}`;
}

function formatPathRelativeToHome(path: string, homeDir?: string): string {
    if (!homeDir) {
        return path;
    }

    const normalizedHome = homeDir.endsWith('/') ? homeDir.slice(0, -1) : homeDir;
    if (!path.startsWith(normalizedHome)) {
        return path;
    }

    const relativePath = path.slice(normalizedHome.length);
    if (relativePath.startsWith('/')) {
        return `~${relativePath}`;
    }

    return relativePath ? `~/${relativePath}` : '~';
}

export function findExistingOrbitSessionIdForNativeEntry(
    entry: NativeCliHistoryEntry,
    sessions: Record<string, Session>,
    options: { allowOffline?: boolean } = {},
): string | null {
    const allowOffline = options.allowOffline === true;
    const nativeEntriesByKey = buildNativeEntriesByKey([entry]);
    const entryProjectPath = getNativeEntryProjectPath(entry);
    const matchingSessions = Object.values(sessions)
        .filter((session) =>
            matchesNativeCliBackend(entry, session)
            && !isInternalCliMirrorSession(session)
            && (allowOffline || isSessionAttachableForNativeEntry(session)),
        )
        .sort((left, right) => compareCliSessions(left, right, nativeEntriesByKey));

    if (matchingSessions.length === 0) {
        return null;
    }

    const sameMachineAndPathMatches = matchingSessions.filter((session) =>
        session.metadata?.machineId === entry.machineId
        && session.metadata?.path === entry.workingDirectory,
    );
    if (sameMachineAndPathMatches.length > 0) {
        return sameMachineAndPathMatches[0]?.id ?? null;
    }

    const sameMachineAndProjectMatches = matchingSessions.filter((session) =>
        session.metadata?.machineId === entry.machineId
        && getSessionProjectPath(session) === entryProjectPath,
    );
    if (sameMachineAndProjectMatches.length > 0) {
        return sameMachineAndProjectMatches[0]?.id ?? null;
    }

    const sameMachineMatches = matchingSessions.filter((session) => session.metadata?.machineId === entry.machineId);
    if (sameMachineMatches.length > 0) {
        return sameMachineMatches[0]?.id ?? null;
    }

    const sameProjectMatches = matchingSessions.filter((session) => getSessionProjectPath(session) === entryProjectPath);
    if (sameProjectMatches.length > 0) {
        return sameProjectMatches[0]?.id ?? null;
    }

    const samePathMatches = matchingSessions.filter((session) => session.metadata?.path === entry.workingDirectory);
    if (samePathMatches.length > 0) {
        return samePathMatches[0]?.id ?? null;
    }

    if (matchingSessions.length === 1) {
        return matchingSessions[0]?.id ?? null;
    }

    return null;
}

export function findReusableOrbitSessionIdForNativeEntry(
    entry: NativeCliHistoryEntry,
    sessions: Record<string, Session>,
    sessionMessages: Record<string, { messages?: Message[] } | undefined>,
    options: { allowOffline?: boolean } = {},
): string | null {
    const existingSessionId = findExistingOrbitSessionIdForNativeEntry(entry, sessions, options);
    if (!existingSessionId) {
        return null;
    }

    const existingSession = sessions[existingSessionId];
    if (!existingSession) {
        return null;
    }

    const existingMessages = sessionMessages[existingSessionId]?.messages;
    if (!shouldReuseExistingOrbitSessionForNativeEntry(entry, existingSession, existingMessages)) {
        return null;
    }

    return existingSessionId;
}

export function findViewableOrbitSessionIdForNativeEntry(
    entry: NativeCliHistoryEntry,
    sessions: Record<string, Session>,
    sessionMessages: Record<string, { messages?: Message[] } | undefined>,
    options: { allowOffline?: boolean } = {},
): string | null {
    const existingSessionId = findExistingOrbitSessionIdForNativeEntry(entry, sessions, options);
    if (!existingSessionId) {
        return null;
    }

    const existingSession = sessions[existingSessionId];
    if (!existingSession) {
        return null;
    }

    const existingMessages = sessionMessages[existingSessionId]?.messages;
    if (!shouldShowExistingOrbitSessionHistoryForNativeEntry(entry, existingSession, existingMessages)) {
        return null;
    }

    return existingSessionId;
}

export function shouldReuseExistingOrbitSessionForNativeEntry(
    entry: NativeCliHistoryEntry,
    session: Session | null | undefined,
    messages: Message[] | undefined,
): boolean {
    if (!session) {
        return false;
    }

    if (!isSessionAttachableForNativeEntry(session)) {
        return false;
    }

    const startedByDaemon = session.metadata?.startedBy === 'daemon' || session.metadata?.startedFromDaemon === true;

    if (!startedByDaemon) {
        return true;
    }

    if (
        session.metadata?.nativeHistorySourceTool === entry.tool
        && session.metadata?.nativeHistorySourceBackendId === entry.backendId
        && typeof session.metadata?.nativeHistoryImportedAt === 'number'
    ) {
        return session.metadata.nativeHistoryImportedAt >= entry.updatedAt;
    }

    return hasMeaningfulSessionHistoryMessages(messages)
        && session.updatedAt >= entry.updatedAt;
}

export function shouldShowExistingOrbitSessionHistoryForNativeEntry(
    entry: NativeCliHistoryEntry,
    session: Session | null | undefined,
    messages: Message[] | undefined,
): boolean {
    if (!session || isInternalCliMirrorSession(session)) {
        return false;
    }

    if (!hasMeaningfulSessionHistoryMessages(messages)) {
        return false;
    }

    if (
        session.metadata?.nativeHistorySourceTool === entry.tool
        && session.metadata?.nativeHistorySourceBackendId === entry.backendId
        && typeof session.metadata?.nativeHistoryImportedAt === 'number'
    ) {
        return session.metadata.nativeHistoryImportedAt >= entry.updatedAt;
    }

    return session.updatedAt >= entry.updatedAt;
}

function matchesNativeCliBackend(entry: NativeCliHistoryEntry, session: Session): boolean {
    if (
        session.metadata?.nativeHistorySourceTool === entry.tool
        && session.metadata?.nativeHistorySourceBackendId === entry.backendId
    ) {
        return true;
    }

    switch (entry.tool) {
        case 'claude':
            return session.metadata?.claudeSessionId === entry.backendId;
        case 'codex':
            return session.metadata?.codexThreadId === entry.backendId;
        case 'gemini':
            return session.metadata?.geminiSessionId === entry.backendId;
    }
}

function isSessionAttachableForNativeEntry(session: Session): boolean {
    return isSessionLikelyOnline(session);
}

function isInternalCliMirrorSession(session: Session): boolean {
    return session.metadata?.sessionRole === 'native-live-mirror';
}

function filterVisibleNativeEntries(
    entries: NativeCliHistoryEntry[],
    hiddenEntryKeys: Set<string>,
): NativeCliHistoryEntry[] {
    if (hiddenEntryKeys.size === 0) {
        return entries;
    }

    return entries.filter((entry) => !hiddenEntryKeys.has(getNativeCliEntrySourceKey(entry)));
}

function hasImportedNativeHistoryForSession(
    session: Session,
    tool: SessionListCliTool,
    backendId: string | null,
): boolean {
    if (!backendId || tool === 'other') {
        return false;
    }

    return session.metadata?.nativeHistorySourceTool === tool
        && session.metadata?.nativeHistorySourceBackendId === backendId
        && typeof session.metadata?.nativeHistoryImportedAt === 'number';
}

export function hasMeaningfulSessionHistoryMessages(messages: Message[] | undefined): boolean {
    return (messages ?? []).some((message) =>
        message.kind === 'user-text'
        || message.kind === 'agent-text'
        || message.kind === 'tool-call',
    );
}

export function getNativeCliEntrySourceKey(entry: Pick<NativeCliHistoryEntry, 'machineId' | 'tool' | 'backendId'>): string {
    return `${entry.machineId}:${entry.tool}:${entry.backendId}`;
}

export function getNativeCliEntrySourceKeyForSession(session: Session): string | null {
    const tool = getSessionCliTool(session);
    const backendId = getSessionBackendId(session);
    const machineId = session.metadata?.machineId;

    if (tool === 'other' || !backendId || !machineId) {
        return null;
    }

    return getNativeCliEntrySourceKey({
        machineId,
        tool,
        backendId,
    });
}
