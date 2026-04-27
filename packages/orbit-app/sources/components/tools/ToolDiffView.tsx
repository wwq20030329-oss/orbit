import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { DiffView } from '@/components/diff/DiffView';

interface ToolDiffViewProps {
    oldText: string;
    newText: string;
    wrapLines: boolean;
    style?: any;
    showLineNumbers?: boolean;
    showPlusMinusSymbols?: boolean;
}

export const ToolDiffView = React.memo<ToolDiffViewProps>(({ 
    oldText, 
    newText, 
    wrapLines,
    style, 
    showLineNumbers = false,
    showPlusMinusSymbols = false 
}) => {
    const diffView = (
        <DiffView 
            oldText={oldText} 
            newText={newText} 
            wrapLines={wrapLines}
            showLineNumbers={showLineNumbers}
            showPlusMinusSymbols={showPlusMinusSymbols}
            style={{ flex: 1, ...style }}
        />
    );
    
    if (wrapLines) {
        // When wrapping lines, no horizontal scroll needed
        return <View style={{ flex: 1 }}>{diffView}</View>;
    }
    
    // When not wrapping, use horizontal scroll
    return (
        <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={{ flexGrow: 1 }}
        >
            {diffView}
        </ScrollView>
    );
});
