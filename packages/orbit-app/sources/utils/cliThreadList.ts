import type { NativeCliHistoryEntry, NativeCliTool, Session } from '@/sync/storageTypes';

type CliThreadSourceItem =
    | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
    | { type: 'session'; session: Session; displayTitle?: string };

export type CliThreadDisplayTool = NativeCliTool | 'openclaw';

export interface CliThreadListItem {
    id: string;
    source: 'native' | 'session';
    tool: CliThreadDisplayTool;
    title: string;
    updatedAt: number;
    projectPath: string | null;
    session: Session | null;
    entry: NativeCliHistoryEntry | null;
}

export interface CliThreadToolSection {
    tool: CliThreadDisplayTool;
    title: string;
    count: number;
    projectCount: number;
    newestUpdatedAt: number | null;
    items: CliThreadListItem[];
    projects: CliThreadProjectGroup[];
}

export interface CliThreadProjectGroup {
    id: string;
    tool: CliThreadDisplayTool;
    machineId: string | null;
    title: string;
    projectPath: string | null;
    updatedAt: number;
    threadCount: number;
    liveThreadCount: number;
    primaryItem: CliThreadListItem;
    items: CliThreadListItem[];
}

export interface CliThreadToolSectionsState {
    sections: CliThreadToolSection[];
    sectionsByTool: Record<CliThreadDisplayTool, CliThreadToolSection>;
}

export const CLI_THREAD_TOOL_ORDER: CliThreadDisplayTool[] = ['claude', 'codex', 'gemini', 'openclaw'];
const GENERIC_PROJECT_DIRECTORY_NAMES = new Set(['project', 'workspace', 'repo']);
export type CliThreadScope = 'current-project' | 'all-projects';

export interface CliThreadScopedProjectsView {
    scope: CliThreadScope;
    scopeProject: CliThreadProjectGroup | null;
    projects: CliThreadProjectGroup[];
    projectCount: number;
    threadCount: number;
}

type CliThreadItemsBySource = {
    native: CliThreadListItem[];
    session: CliThreadListItem[];
};

type CliThreadBucketsByTool = Record<CliThreadDisplayTool, CliThreadItemsBySource>;

const cliThreadToolSectionsStateCache = new WeakMap<readonly CliThreadSourceItem[], CliThreadToolSectionsState>();
const CLI_THREAD_TOOL_RANK: Record<CliThreadDisplayTool, number> = {
    claude: 0,
    codex: 1,
    gemini: 2,
    openclaw: 3,
};

export function buildCliThreadToolSections(data: readonly CliThreadSourceItem[]): CliThreadToolSection[] {
    return buildCliThreadToolSectionsState(data).sections;
}

export function buildCliThreadToolSection(
    data: readonly CliThreadSourceItem[],
    tool: CliThreadDisplayTool,
): CliThreadToolSection {
    return buildCliThreadToolSectionsState(data).sectionsByTool[tool];
}

export function buildCliThreadToolSectionsState(data: readonly CliThreadSourceItem[]): CliThreadToolSectionsState {
    const cachedState = cliThreadToolSectionsStateCache.get(data);
    if (cachedState) {
        return cachedState;
    }

    const bucketsByTool = createCliThreadBucketsByTool();
    for (const item of data) {
        const threadItem = toCliThreadListItem(item);
        if (!threadItem) {
            continue;
        }

        bucketsByTool[threadItem.tool][threadItem.source].push(threadItem);
    }

    const sections = CLI_THREAD_TOOL_ORDER.map((tool) => {
        const buckets = bucketsByTool[tool];
        return buildCliThreadToolSectionFromItems(tool, buckets.native, buckets.session);
    });
    const sectionsByTool = {
        claude: sections[0],
        codex: sections[1],
        gemini: sections[2],
        openclaw: sections[3],
    };
    const state = {
        sections,
        sectionsByTool,
    };
    cliThreadToolSectionsStateCache.set(data, state);
    return state;
}

function createCliThreadBucketsByTool(): CliThreadBucketsByTool {
    return {
        claude: { native: [], session: [] },
        codex: { native: [], session: [] },
        gemini: { native: [], session: [] },
        openclaw: { native: [], session: [] },
    };
}

function buildCliThreadToolSectionFromItems(
    tool: CliThreadDisplayTool,
    nativeItems: readonly CliThreadListItem[],
    sessionItems: readonly CliThreadListItem[],
): CliThreadToolSection {
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
}

export function pickPreferredCliThreadTool(
    sections: CliThreadToolSection[],
    preferredTool: CliThreadDisplayTool | null | undefined,
): CliThreadDisplayTool {
    if (preferredTool) {
        return preferredTool;
    }

    let mostRecentSection: CliThreadToolSection | null = null;
    for (const section of sections) {
        if (section.newestUpdatedAt === null) {
            continue;
        }

        if (!mostRecentSection) {
            mostRecentSection = section;
            continue;
        }

        if (section.newestUpdatedAt > (mostRecentSection.newestUpdatedAt ?? 0)) {
            mostRecentSection = section;
            continue;
        }

        if (
            section.newestUpdatedAt === mostRecentSection.newestUpdatedAt
            && CLI_THREAD_TOOL_RANK[section.tool] < CLI_THREAD_TOOL_RANK[mostRecentSection.tool]
        ) {
            mostRecentSection = section;
        }
    }

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

export function getCliSectionTitle(tool: CliThreadDisplayTool): string {
    switch (tool) {
        case 'claude':
            return 'Claude';
        case 'codex':
            return 'Codex';
        case 'gemini':
            return 'Gemini';
        case 'openclaw':
            return 'OpenClaw';
    }
}

export function getSessionCliTool(session: Session): CliThreadDisplayTool | 'other' {
    if (session.metadata?.flavor === 'openclaw') {
        return 'openclaw';
    }

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

function getCliThreadItemIdForSession(session: Session, tool: CliThreadDisplayTool): string {
    const backendId = session.metadata?.claudeSessionId
        ?? session.metadata?.codexThreadId
        ?? session.metadata?.geminiSessionId
        ?? session.metadata?.nativeHistorySourceBackendId
        ?? session.id;

    return `${tool}:${backendId}`;
}

function buildCliThreadProjectGroups(
    tool: CliThreadDisplayTool,
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
