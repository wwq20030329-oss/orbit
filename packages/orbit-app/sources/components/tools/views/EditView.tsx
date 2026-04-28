import * as React from 'react';
import { ToolViewProps } from './_all';
import { knownTools } from '../../tools/knownTools';
import { resolvePath } from '@/utils/pathUtils';
import { FileChangeSummaryView } from './FileChangeSummaryView';


export const EditView = React.memo<ToolViewProps>(({ tool, metadata, sessionId }) => {
    let filePath = '';
    const parsed = knownTools.Edit.input.safeParse(tool.input);
    if (parsed.success) {
        filePath = resolvePath(parsed.data.file_path || '', metadata);
    }

    return <FileChangeSummaryView sessionId={sessionId} items={filePath ? [{ path: filePath }] : []} />;
});
