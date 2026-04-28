import type { Message, ToolCallMessage } from '@/sync/typesMessage';

export type PendingPermissionEntry = {
    message: ToolCallMessage;
};

/**
 * Walk messages and return any tool-call messages with a pending permission.
 * The list keeps insertion order so the sticky banner can show the oldest
 * unresolved permission first while a badge surfaces the count.
 */
export function findPendingPermissions(messages: Message[]): PendingPermissionEntry[] {
    const out: PendingPermissionEntry[] = [];
    for (const m of messages) {
        if (m.kind !== 'tool-call') continue;
        if (!m.tool) continue;
        if (m.tool.name === 'AskUserQuestion') continue; // has its own UI
        const status = m.tool.permission?.status;
        if (status === 'pending') {
            out.push({ message: m });
        }
    }
    return out;
}
