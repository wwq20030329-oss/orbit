import type { NativeCliHistoryEntry, NativeCliTool, Session } from '@/sync/storageTypes';

type CliThreadSourceItem =
    | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
    | { type: 'session'; session: Session; displayTitle?: string };

export interface CliThreadListItem {
    id: string;
    source: 'native' | 'session';
    tool: NativeCliTool;
    title: string;
    updatedAt: number;
    projectPath: string | null;
    session: Session | null;
    entry: NativeCliHistoryEntry | null;
}

export interface CliThreadToolSection {
    tool: NativeCliTool;
    title: string;
    count: number;
    projectCount: number;
    newestUpdatedAt: number | null;
    items: CliThreadListItem[];
    projects: CliThreadProjectGroup[];
}

export interface CliThreadProjectGroup {
    id: string;
    tool: NativeCliTool;
    machineId: string | null;
    title: string;
    projectPath: string | null;
    updatedAt: number;
    threadCount: number;
    liveThreadCount: number;
    primaryItem: CliThreadListItem;
    items: CliThreadListItem[];
}

export const CLI_THREAD_TOOL_ORDER: NativeCliTool[] = ['claude', 'codex', 'gemini'];
const GENERIC_PROJECT_DIRECTORY_NAMES = new Set(['project', 'workspace', 'repo']);
export type CliThreadScope = 'current-project' | 'all-projects';

export interface CliThreadScopedProjectsView {
    scope: CliThreadScope;
    scopeProject: CliThreadProjectGroup | null;
    projects: CliThreadProjectGroup[];
    projectCount: number;
    threadCount: number;
}

export function buildCliThreadToolSections(data: readonly CliThreadSourceItem[]): CliThreadToolSection[] {
    const nativeItemsByTool = new Map<NativeCliTool, CliThreadListItem[]>();
    const sessionItemsByTool = new Map<NativeCliTool, CliThreadListItem[]>();

    for (const tool of CLI_THREAD_TOOL_ORDER) {
        nativeItemsByTool.set(tool, []);
        sessionItemsByTool.set(tool, []);
    }

    for (const item of data) {
        const threadItem = toCliThreadListItem(item);
        if (!threadItem) {
            continue;
        }

        const targetCollection = threadItem.source === 'native'
            ? nativeItemsByTool.get(threadItem.tool)
            : sessionItemsByTool.get(threadItem.tool);
        if (!targetCollection) {
            continue;
        }

        targetCollection.push(threadItem);
    }

    return CLI_THREAD_TOOL_ORDER.map((tool) => {
        const nativeItems = nativeItemsByTool.get(tool) ?? [];
        const sessionItems = sessionItemsByTool.get(tool) ?? [];
        const preferredItems = nativeItems.length > 0 ? nativeItems : sessionItems;
        const dedupedItems = new Map<string, CliThreadListItem>();

        for (const threadItem of preferredItems) {
            const existing = dedupedItems.get(threadItem.id);
            if (!existing || compareCliThreadItemsForDedup(threadItem, existing) < 0) {
                dedupedItems.set(threadItem.id, threadItem);
            }
        }

        const items = Array.from(dedupedItems.values()).sort(compareCliThreadItemsForDisplay);
        const projects = buildCliThreadProjectGroups(tool, items);
        return {
            tool,
            title: getCliSectionTitle(tool),
            count: items.length,
            projectCount: projects.length,
            newestUpdatedAt: items[0]?.updatedAt ?? null,
            items,
            projects,
        };
    });
}

export function pickPreferredCliThreadTool(
    sections: CliThreadToolSection[],
    preferredTool: NativeCliTool | null | undefined,
): NativeCliTool {
    if (preferredTool) {
        return preferredTool;
    }

    const mostRecentSection = [...sections]
        .filter((section) => section.newestUpdatedAt !== null)
        .sort((left, right) => {
            const leftUpdatedAt = left.newestUpdatedAt ?? 0;
            const rightUpdatedAt = right.newestUpdatedAt ?? 0;
            if (leftUpdatedAt !== rightUpdatedAt) {
                return rightUpdatedAt - leftUpdatedAt;
            }
            return CLI_THREAD_TOOL_ORDER.indexOf(left.tool) - CLI_THREAD_TOOL_ORDER.indexOf(right.tool);
        })[0];

    return mostRecentSection?.tool ?? 'claude';
}

export function formatCliThreadUpdatedAt(updatedAt: number): string {
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

export function getCliThreadScopedProjects(
    section: CliThreadToolSection,
    scope: CliThreadScope,
): CliThreadScopedProjectsView {
    const scopeProject = pickCurrentCliThreadProject(section);
    const projects = scope === 'current-project' && scopeProject
        ? [scopeProject]
        : section.projects;

    return {
        scope,
        scopeProject,
        projects,
        projectCount: projects.length,
        threadCount: projects.reduce((total, project) => total + project.threadCount, 0),
    };
}

export function pickCurrentCliThreadProject(section: CliThreadToolSection): CliThreadProjectGroup | null {
    const liveProject = section.projects.find((project) => project.liveThreadCount > 0);
    return liveProject ?? section.projects[0] ?? null;
}

function toCliThreadListItem(item: CliThreadSourceItem): CliThreadListItem | null {
    if (item.type === 'native-cli-session') {
        const projectPath = normalizeProjectPath(item.entry.workingDirectory)
            ?? normalizeProjectPath(item.entry.projectRoot ?? null)
            ?? null;
        return {
            id: `${item.entry.tool}:${item.entry.backendId}`,
            source: 'native',
            tool: item.entry.tool,
            title: item.displayTitle || item.entry.title,
            updatedAt: item.entry.updatedAt,
            projectPath,
            session: null,
            entry: item.entry,
        };
    }

    if (item.type === 'session') {
        const tool = getSessionCliTool(item.session);
        if (tool === 'other') {
            return null;
        }

        return {
            id: getCliThreadItemIdForSession(item.session, tool),
            source: 'session',
            tool,
            title: item.displayTitle || item.session.metadata?.summary?.text || item.session.metadata?.name || 'CLI Session',
            updatedAt: item.session.updatedAt,
            projectPath: normalizeProjectPath(item.session.metadata?.path ?? item.session.metadata?.projectRoot ?? null),
            session: item.session,
            entry: null,
        };
    }

    return null;
}

function getCliSectionTitle(tool: NativeCliTool): string {
    switch (tool) {
        case 'claude':
            return 'Claude';
        case 'codex':
            return 'Codex';
        case 'gemini':
            return 'Gemini';
    }
}

function getSessionCliTool(session: Session): NativeCliTool | 'other' {
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

function getCliThreadItemIdForSession(session: Session, tool: NativeCliTool): string {
    const backendId = session.metadata?.claudeSessionId
        ?? session.metadata?.codexThreadId
        ?? session.metadata?.geminiSessionId
        ?? session.metadata?.nativeHistorySourceBackendId
        ?? session.id;

    return `${tool}:${backendId}`;
}

function buildCliThreadProjectGroups(
    tool: NativeCliTool,
    items: CliThreadListItem[],
): CliThreadProjectGroup[] {
    const groups = new Map<string, CliThreadProjectGroup>();

    for (const item of items) {
        const machineId = item.entry?.machineId ?? item.session?.metadata?.machineId ?? null;
        const normalizedProjectPath = normalizeProjectPath(item.projectPath);
        const projectKey = normalizedProjectPath
            ? `${machineId ?? 'unknown-machine'}:${normalizedProjectPath}`
            : `unscoped:${item.id}`;
        const existing = groups.get(projectKey);

        if (existing) {
            existing.items.push(item);
            existing.threadCount += 1;
            existing.liveThreadCount += isCliThreadItemLive(item) ? 1 : 0;
            if (compareCliThreadItemsForDisplay(item, existing.primaryItem) < 0) {
                existing.primaryItem = item;
            }
            existing.updatedAt = Math.max(existing.updatedAt, item.updatedAt);
            continue;
        }

        groups.set(projectKey, {
            id: `${tool}:${projectKey}`,
            tool,
            machineId,
            title: normalizedProjectPath ? getProjectTitle(normalizedProjectPath) : 'Unscoped Session',
            projectPath: normalizedProjectPath,
            updatedAt: item.updatedAt,
            threadCount: 1,
            liveThreadCount: isCliThreadItemLive(item) ? 1 : 0,
            primaryItem: item,
            items: [item],
        });
    }

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            items: [...group.items].sort(compareCliThreadItemsForDisplay),
        }))
        .sort((left, right) => {
            if (left.updatedAt !== right.updatedAt) {
                return right.updatedAt - left.updatedAt;
            }

            return left.title.localeCompare(right.title);
        });
}

function normalizeProjectPath(path: string | null): string | null {
    if (!path) {
        return null;
    }

    const normalized = path.replace(/\/+$/, '');
    return normalized || null;
}

function getProjectTitle(path: string): string {
    const normalized = path.replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    const lastSegment = segments.at(-1);
    if (!lastSegment) {
        return path;
    }

    if (GENERIC_PROJECT_DIRECTORY_NAMES.has(lastSegment.toLowerCase()) && segments.length >= 2) {
        return segments.at(-2) ?? lastSegment;
    }

    return lastSegment;
}

function isCliThreadItemLive(item: CliThreadListItem): boolean {
    if (item.entry?.isLive === true) {
        return true;
    }

    return item.session?.presence === 'online' || item.session?.active === true;
}

function compareCliThreadItemsForDedup(left: CliThreadListItem, right: CliThreadListItem): number {
    const sourceDelta = getCliThreadSourcePriority(left) - getCliThreadSourcePriority(right);
    if (sourceDelta !== 0) {
        return sourceDelta;
    }

    return compareCliThreadItemsForDisplay(left, right);
}

function compareCliThreadItemsForDisplay(left: CliThreadListItem, right: CliThreadListItem): number {
    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    return left.title.localeCompare(right.title);
}

function getCliThreadSourcePriority(item: CliThreadListItem): number {
    return item.source === 'native' ? 0 : 1;
}
