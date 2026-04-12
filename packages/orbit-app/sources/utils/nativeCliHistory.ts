import type { SessionListViewItem } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';

export function appendNativeCliHistoryToSessionList(
    baseItems: SessionListViewItem[],
    entries: NativeCliHistoryEntry[],
    machinesById: Record<string, Machine>,
): SessionListViewItem[] {
    if (entries.length === 0) {
        return baseItems;
    }

    const historySection = buildNativeCliHistorySections(entries, machinesById);

    const activeSessionsIndex = baseItems.findIndex((item) => item.type === 'active-sessions');
    if (activeSessionsIndex !== -1) {
        return [
            ...baseItems.slice(0, activeSessionsIndex + 1),
            ...historySection,
            ...baseItems.slice(activeSessionsIndex + 1),
        ];
    }

    return [
        ...historySection,
        ...baseItems,
    ];
}

function buildNativeCliHistorySections(
    entries: NativeCliHistoryEntry[],
    machinesById: Record<string, Machine>,
): SessionListViewItem[] {
    const toolOrder = ['claude', 'codex', 'gemini'] as const;
    const toolTitles: Record<(typeof toolOrder)[number], string> = {
        claude: 'Claude History',
        codex: 'Codex History',
        gemini: 'Gemini History',
    };

    const sections: SessionListViewItem[] = [];
    for (const tool of toolOrder) {
        const toolEntries = entries.filter((entry) => entry.tool === tool);
        if (toolEntries.length === 0) {
            continue;
        }

        sections.push({ type: 'header', title: toolTitles[tool] });

        const groups = new Map<string, NativeCliHistoryEntry[]>();
        for (const entry of toolEntries) {
            const groupKey = `${entry.machineId}:${entry.workingDirectory}`;
            const group = groups.get(groupKey);
            if (group) {
                group.push(entry);
            } else {
                groups.set(groupKey, [entry]);
            }
        }

        const sortedGroups = Array.from(groups.entries())
            .map(([groupKey, groupEntries]) => ({
                groupKey,
                groupEntries: groupEntries.sort((left, right) => right.updatedAt - left.updatedAt),
            }))
            .sort((left, right) => right.groupEntries[0]!.updatedAt - left.groupEntries[0]!.updatedAt);

        for (const { groupEntries } of sortedGroups) {
            const firstEntry = groupEntries[0]!;
            const machine = machinesById[firstEntry.machineId];
            if (machine) {
                sections.push({
                    type: 'native-cli-project-group',
                    tool,
                    machine,
                    title: getProjectTitle(firstEntry.workingDirectory),
                    subtitle: buildProjectSubtitle(firstEntry, machine),
                });
            }

            sections.push(...groupEntries.map((entry) => ({ type: 'native-cli-session', entry } as const)));
        }
    }

    return sections;
}

function getProjectTitle(workingDirectory: string): string {
    const normalized = workingDirectory.replace(/\/+$/, '');
    const segments = normalized.split('/').filter(Boolean);
    return segments.at(-1) ?? workingDirectory;
}

function buildProjectSubtitle(entry: NativeCliHistoryEntry, machine: Machine): string {
    const relativePath = formatPathRelativeToHome(entry.workingDirectory, machine.metadata?.homeDir);
    const machineLabel = machine.metadata?.displayName || machine.metadata?.host || machine.id;
    return `${relativePath} · ${machineLabel}`;
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
