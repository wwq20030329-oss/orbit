import * as React from 'react';
import { ToolViewProps } from './_all';
import { knownTools } from '../../tools/knownTools';
import { resolvePath } from '@/utils/pathUtils';
import { FileChangeSummaryView } from './FileChangeSummaryView';

export const MultiEditView = React.memo<ToolViewProps>(({ tool, metadata, sessionId }) => {
    let edits: Array<{ old_string: string; new_string: string; replace_all?: boolean }> = [];
    
    const parsed = knownTools.MultiEdit.input.safeParse(tool.input);
    if (parsed.success && parsed.data.edits) {
        edits = parsed.data.edits;
    }

    if (edits.length === 0) {
        return null;
    }

    const filePath = typeof tool.input?.file_path === 'string'
        ? resolvePath(tool.input.file_path, metadata)
        : null;

    return (
        <FileChangeSummaryView
            sessionId={sessionId}
            items={filePath ? [{ path: filePath, label: `${filePath} · ${edits.length} edits` }] : []}
        />
    );
});
