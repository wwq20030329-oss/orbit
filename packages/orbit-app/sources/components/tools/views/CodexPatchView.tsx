import * as React from 'react';
import { resolvePath } from '@/utils/pathUtils';
import { FileChangeSummaryView } from './FileChangeSummaryView';
import { ToolViewProps } from './_all';

type CodexPatchEntry = {
    diff?: string;
    kind?: {
        type?: string;
        move_path?: string | null;
    };
    add?: {
        content?: string;
    };
    modify?: {
        old_content?: string;
        new_content?: string;
    };
    delete?: {
        content?: string;
    };
};

function getPatchChanges(input: any): Record<string, CodexPatchEntry> | null {
    if (input?.changes && typeof input.changes === 'object' && !Array.isArray(input.changes)) {
        return input.changes as Record<string, CodexPatchEntry>;
    }
    if (input?.fileChanges && typeof input.fileChanges === 'object' && !Array.isArray(input.fileChanges)) {
        return input.fileChanges as Record<string, CodexPatchEntry>;
    }
    return null;
}

function getPatchKindLabel(change: CodexPatchEntry): string | null {
    switch (change.kind?.type) {
        case 'add':
            return 'new';
        case 'delete':
            return 'delete';
        case 'update':
            return change.kind.move_path ? 'move' : 'edit';
        default:
            return null;
    }
}

export const CodexPatchView = React.memo<ToolViewProps>(({ tool, metadata, sessionId }) => {
    const { input } = tool;
    const changes = getPatchChanges(input);

    const entries = changes ? Object.entries(changes) : [];

    if (entries.length === 0) {
        return null;
    }

    return (
        <>
            <FileChangeSummaryView
                sessionId={sessionId}
                items={entries.map(([file, change]) => {
                    const filePath = resolvePath(file, metadata);
                    const movePath = change.kind?.move_path ? resolvePath(change.kind.move_path, metadata) : null;
                    const kindLabel = getPatchKindLabel(change);

                    return {
                        path: movePath || filePath,
                        label: movePath
                            ? `${filePath} → ${movePath}`
                            : kindLabel
                                ? `${filePath} · ${kindLabel}`
                                : filePath,
                        disabled: change.kind?.type === 'delete',
                    };
                })}
            />
        </>
    );
});
