import * as React from 'react';
import { View } from 'react-native';
import { ToolCall } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { knownTools } from '@/components/tools/knownTools';
import { toolFullViewStyles } from '../ToolFullView';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { trimIdent } from '@/utils/trimIdent';

interface EditViewFullProps {
    tool: ToolCall;
    metadata: Metadata | null;
    wrapLinesInDiffs?: boolean;
}

export const EditViewFull = React.memo<EditViewFullProps>(({ tool, metadata, wrapLinesInDiffs = false }) => {
    const { input } = tool;

    // Parse the input
    let oldString = '';
    let newString = '';
    const parsed = knownTools.Edit.input.safeParse(input);
    if (parsed.success) {
        oldString = trimIdent(parsed.data.old_string || '');
        newString = trimIdent(parsed.data.new_string || '');
    }

    return (
        <View style={toolFullViewStyles.sectionFullWidth}>
            <ToolDiffView 
                oldText={oldString} 
                newText={newString} 
                wrapLines={wrapLinesInDiffs}
                style={{ width: '100%' }}
                showLineNumbers={true}
                showPlusMinusSymbols={true}
            />
        </View>
    );
});
