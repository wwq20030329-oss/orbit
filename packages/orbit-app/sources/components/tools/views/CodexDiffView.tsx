import * as React from 'react';
import { resolvePath } from '@/utils/pathUtils';
import { parseUnifiedDiff } from '@/utils/codexUnifiedDiff';
import { FileChangeSummaryView } from './FileChangeSummaryView';
import { ToolViewProps } from './_all';

export const CodexDiffView = React.memo<ToolViewProps>(({ tool, metadata, sessionId }) => {
    const { input } = tool;
    let fileName: string | undefined;

    if (input?.unified_diff && typeof input.unified_diff === 'string') {
        const parsed = parseUnifiedDiff(input.unified_diff);
        fileName = parsed.fileName ? resolvePath(parsed.fileName, metadata) : undefined;
    }

    return fileName ? <FileChangeSummaryView sessionId={sessionId} items={[{ path: fileName }]} /> : null;
});
