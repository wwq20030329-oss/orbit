import type { Message, ToolCallMessage } from '@/sync/typesMessage';

// Tools that are pure read/inspect operations. Folding consecutive runs of
// these reduces visual noise without hiding the agent's intent — when a user
// cares about which files were read they expand the chip.
const READ_ONLY_TOOL_NAMES = new Set<string>([
    'Read', 'read',
    'Glob', 'glob',
    'LS',
    'Grep', 'grep',
    'NotebookRead',
]);

const READ_ONLY_GROUP_THRESHOLD = 2; // group only if 2+ consecutive

export type ReadOnlyToolGroup = {
    kind: 'tool-group';
    id: string;
    tools: ToolCallMessage[];
};

export type GroupedMessage = Message | ReadOnlyToolGroup;

function isFoldableReadOnlyTool(message: Message): message is ToolCallMessage {
    if (message.kind !== 'tool-call' || !message.tool) {
        return false;
    }
    // Only fold tools that have actually settled. Running / errored tools stay
    // visible so the user can see live progress and act on failures.
    if (message.tool.state !== 'completed') {
        return false;
    }
    // Skip permissioned tools — even read-only ones may have a pending decision
    // that the user must see.
    if (message.tool.permission && message.tool.permission.status === 'pending') {
        return false;
    }
    return READ_ONLY_TOOL_NAMES.has(message.tool.name);
}

export function groupConsecutiveTools(messages: Message[]): GroupedMessage[] {
    const result: GroupedMessage[] = [];
    let buffer: ToolCallMessage[] = [];

    const flush = () => {
        if (buffer.length === 0) return;
        if (buffer.length < READ_ONLY_GROUP_THRESHOLD) {
            for (const m of buffer) result.push(m);
        } else {
            result.push({
                kind: 'tool-group',
                id: `tool-group:${buffer[0].id}:${buffer[buffer.length - 1].id}`,
                tools: buffer,
            });
        }
        buffer = [];
    };

    for (const m of messages) {
        if (isFoldableReadOnlyTool(m)) {
            buffer.push(m);
        } else {
            flush();
            result.push(m);
        }
    }
    flush();
    return result;
}
