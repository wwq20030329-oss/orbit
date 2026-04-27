import { MarkdownSpan } from './parseMarkdown';
import { parseMarkdownIncremental } from './parseMarkdownIncremental';
import * as React from 'react';
import { Image, Pressable, ScrollView, View, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';
import { Text } from '../StyledText';
import { Typography } from '@/constants/Typography';
import { SimpleSyntaxHighlighter } from '../SimpleSyntaxHighlighter';
import { Modal } from '@/modal';
import { useLocalSetting } from '@/sync/storage';
import { storeTempText } from '@/sync/persistence';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { MermaidRenderer } from './MermaidRenderer';
import { t } from '@/text';
import { isHttpMarkdownLink } from './linkUtils';

// Option type for callback
export type Option = {
    title: string;
};

type MarkdownContentViewProps = {
    markdown: string;
    onOptionPress?: (option: Option) => void;
    sessionId?: string;
    markdownCopyV2: boolean;
};

export const MarkdownContentView = React.memo((props: MarkdownContentViewProps) => {
    // `parseMarkdownIncremental` memoizes each block by its raw source
    // substring, so across streaming ticks unchanged blocks keep their
    // exact same reference. Combined with the memoized block renderers
    // below this turns the hot path from O(total markdown length) into
    // O(length of the tail block being streamed).
    const entries = React.useMemo(() => parseMarkdownIncremental(props.markdown), [props.markdown]);

    // Backwards compatibility: The original version just returned the view, wrapping the list of blocks.
    // It made each of the individual text elements selectable. When we enable the markdownCopyV2 feature,
    // we disable the selectable property on individual text segments on mobile only. Instead, the long press
    // will be handled by a wrapper Pressable. If we don't disable the selectable property, then you will see
    // the native copy modal come up at the same time as the long press handler is fired.
    const selectable = !props.markdownCopyV2;
    const router = useRouter();

    const handleLinkPress = React.useCallback((url: string) => {
        if (!isHttpMarkdownLink(url)) {
            return;
        }

        void WebBrowser.openBrowserAsync(url);
    }, []);

    // Stash the latest markdown in a ref so that `handleLongPress` is
    // itself stable across renders — previously the callback depended
    // on `props.markdown` and therefore changed every streaming tick,
    // busting the memoization of any downstream gesture handler.
    const markdownRef = React.useRef(props.markdown);
    React.useEffect(() => {
        markdownRef.current = props.markdown;
    }, [props.markdown]);

    const handleLongPress = React.useCallback(() => {
        try {
            const textId = storeTempText(markdownRef.current);
            router.push(`/text-selection?textId=${textId}`);
        } catch (error) {
            console.error('Error storing text for selection:', error);
            Modal.alert(t('common.error'), t('errors.tryAgain'));
        }
    }, [router]);

    const onOptionPress = props.onOptionPress;
    const content = (
        <View style={{ width: '100%' }}>
            {entries.map((entry) => {
                const { block, source } = entry;
                // Use the block's raw source substring as the React key.
                // Two consecutive renders of the same block (unchanged
                // source) keep the same component instance, so React
                // short-circuits reconciliation entirely.
                const key = source;
                switch (block.type) {
                    case 'text':
                        return (
                            <RenderTextBlock
                                key={key}
                                spans={block.content}
                                selectable={selectable}
                                onLinkPress={handleLinkPress}
                            />
                        );
                    case 'header':
                        return (
                            <RenderHeaderBlock
                                key={key}
                                level={block.level}
                                spans={block.content}
                                selectable={selectable}
                                onLinkPress={handleLinkPress}
                            />
                        );
                    case 'horizontal-rule':
                        return <View key={key} style={style.horizontalRule} />;
                    case 'list':
                        return (
                            <RenderListBlock
                                key={key}
                                items={block.items}
                                selectable={selectable}
                                onLinkPress={handleLinkPress}
                            />
                        );
                    case 'numbered-list':
                        return (
                            <RenderNumberedListBlock
                                key={key}
                                items={block.items}
                                selectable={selectable}
                                onLinkPress={handleLinkPress}
                            />
                        );
                    case 'code-block':
                        return (
                            <RenderCodeBlock
                                key={key}
                                content={block.content}
                                language={block.language}
                                selectable={selectable}
                            />
                        );
                    case 'mermaid':
                        return <MermaidRenderer key={key} content={block.content} />;
                    case 'options':
                        return (
                            <RenderOptionsBlock
                                key={key}
                                items={block.items}
                                selectable={selectable}
                                onOptionPress={onOptionPress}
                            />
                        );
                    case 'table':
                        return (
                            <RenderTableBlock
                                key={key}
                                headers={block.headers}
                                rows={block.rows}
                                onLinkPress={handleLinkPress}
                                selectable={selectable}
                            />
                        );
                    case 'image':
                        return <RenderImageBlock key={key} url={block.url} alt={block.alt} />;
                    default:
                        return null;
                }
            })}
        </View>
    );

    if (!props.markdownCopyV2 || false) {
        return content;
    }

    return (
        <LongPressGestureWrapper onLongPress={handleLongPress}>
            {content}
        </LongPressGestureWrapper>
    );
});

// Gesture wrapper extracted so the gesture object is constructed once
// per `onLongPress` identity rather than once per render of the owning
// MarkdownContentView. The old code rebuilt a `Gesture.LongPress()`
// every render, which in turn rebuilt the underlying native handler.
const LongPressGestureWrapper = React.memo((props: {
    onLongPress: () => void;
    children: React.ReactNode;
}) => {
    const gesture = React.useMemo(() => (
        Gesture.LongPress()
            .minDuration(500)
            .onStart(() => {
                props.onLongPress();
            })
            .runOnJS(true)
    ), [props.onLongPress]);

    return (
        <GestureDetector gesture={gesture}>
            <View style={{ width: '100%' }}>
                {props.children}
            </View>
        </GestureDetector>
    );
});

export const MarkdownView = React.memo((props: Omit<MarkdownContentViewProps, 'markdownCopyV2'>) => {
    const markdownCopyV2 = useLocalSetting('markdownCopyV2');
    return <MarkdownContentView {...props} markdownCopyV2={markdownCopyV2} />;
});

type RenderSpanProps = {
    spans: MarkdownSpan[];
    baseStyle?: any;
    selectable: boolean;
    onLinkPress: (url: string) => void;
};

// Every block renderer is wrapped in `React.memo`. Because the parent
// now reuses the same cached `MarkdownBlock` references for unchanged
// blocks (see `parseMarkdownIncremental`), the default shallow prop
// comparison is enough to skip re-rendering entire paragraphs / code
// fences / tables while the AI is streaming new content below them.
const RenderTextBlock = React.memo((props: { spans: MarkdownSpan[], selectable: boolean, onLinkPress: (url: string) => void }) => {
    return <Text selectable={props.selectable} style={style.text}><RenderSpans spans={props.spans} baseStyle={style.text} selectable={props.selectable} onLinkPress={props.onLinkPress} /></Text>;
});

const RenderHeaderBlock = React.memo((props: { level: 1 | 2 | 3 | 4 | 5 | 6, spans: MarkdownSpan[], selectable: boolean, onLinkPress: (url: string) => void }) => {
    const s = (style as any)[`header${props.level}`];
    const headerStyle = [style.header, s];
    return <Text selectable={props.selectable} style={headerStyle}><RenderSpans spans={props.spans} baseStyle={headerStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></Text>;
});

const RenderListBlock = React.memo((props: { items: MarkdownSpan[][], selectable: boolean, onLinkPress: (url: string) => void }) => {
    const listStyle = [style.text, style.list];
    return (
        <View style={{ flexDirection: 'column', marginBottom: 8, gap: 1 }}>
            {props.items.map((item, index) => (
                <Text selectable={props.selectable} style={listStyle} key={index}>- <RenderSpans spans={item} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></Text>
            ))}
        </View>
    );
});

const RenderNumberedListBlock = React.memo((props: { items: { number: number, spans: MarkdownSpan[] }[], selectable: boolean, onLinkPress: (url: string) => void }) => {
    const listStyle = [style.text, style.list];
    return (
        <View style={{ flexDirection: 'column', marginBottom: 8, gap: 1 }}>
            {props.items.map((item, index) => (
                <Text selectable={props.selectable} style={listStyle} key={index}>{item.number.toString()}. <RenderSpans spans={item.spans} baseStyle={listStyle} selectable={props.selectable} onLinkPress={props.onLinkPress} /></Text>
            ))}
        </View>
    );
});

const RenderCodeBlock = React.memo((props: { content: string, language: string | null, selectable: boolean }) => {
    const copyCode = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(props.content);
            Modal.alert(t('common.success'), t('markdown.codeCopied'), [{ text: t('common.ok'), style: 'cancel' }]);
        } catch (error) {
            console.error('Failed to copy code:', error);
            Modal.alert(t('common.error'), t('markdown.copyFailed'), [{ text: t('common.ok'), style: 'cancel' }]);
        }
    }, [props.content]);

    return (
        <View style={style.codeBlock}>
            {props.language && <Text selectable={props.selectable} style={style.codeLanguage}>{props.language}</Text>}
            <ScrollView
                style={{ flexGrow: 0, flexShrink: 0 }}
                horizontal={true}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
                showsHorizontalScrollIndicator={false}
            >
                <SimpleSyntaxHighlighter
                    code={props.content}
                    language={props.language}
                    selectable={props.selectable}
                />
            </ScrollView>
            <View style={[style.copyButtonWrapper, style.copyButtonWrapperVisible]}>
                <Pressable
                    style={style.copyButton}
                    onPress={copyCode}
                >
                    <Text style={style.copyButtonText}>{t('common.copy')}</Text>
                </Pressable>
            </View>
        </View>
    );
});

const RenderImageBlock = React.memo((props: { url: string, alt: string }) => {
    const accessibleLabel = props.alt || 'Markdown image';

    return (
        <View style={style.imageBlock}>
            <Image
                source={{ uri: props.url }}
                style={style.image}
                accessibilityLabel={accessibleLabel}
                resizeMode="contain"
            />
            {props.alt ? (
                <Text style={style.imageCaption}>{props.alt}</Text>
            ) : null}
        </View>
    );
});

const RenderOptionsBlock = React.memo((props: {
    items: string[],
    selectable: boolean,
    onOptionPress?: (option: Option) => void
}) => {
    return (
        <View style={style.optionsContainer}>
            {props.items.map((item, index) => {
                if (props.onOptionPress) {
                    return (
                        <Pressable 
                            key={index} 
                            style={({ pressed }) => [
                                style.optionItem,
                                pressed && style.optionItemPressed
                            ]}
                            onPress={() => props.onOptionPress?.({ title: item })}
                        >
                            <Text selectable={props.selectable} style={style.optionText}>{item}</Text>
                        </Pressable>
                    );
                } else {
                    return (
                        <View key={index} style={style.optionItem}>
                            <Text selectable={props.selectable} style={style.optionText}>{item}</Text>
                        </View>
                    );
                }
            })}
        </View>
    );
});

function RenderSpans(props: RenderSpanProps) {
    return (<>
        {props.spans.map((span, index) => {
            if (span.url) {
                const isExternalLink = isHttpMarkdownLink(span.url);
                return (
                    <Text
                        key={index}
                        selectable={props.selectable}
                        accessibilityRole={isExternalLink ? 'link' : undefined}
                        style={[props.baseStyle, isExternalLink && style.link, span.styles.map(s => style[s])]}
                        onPress={isExternalLink ? () => props.onLinkPress(span.url!) : undefined}
                    >
                        {span.text}
                    </Text>
                );
            } else {
                return <Text key={index} selectable={props.selectable} style={[props.baseStyle, span.styles.map(s => style[s])]}>{span.text}</Text>
            }
        })}
    </>)
}

// Table rendering uses column-first layout to ensure consistent column widths.
// Each column is rendered as a vertical container with all its cells (header + data).
// This ensures that cells in the same column have the same width, determined by the widest content.
const RenderTableBlock = React.memo((props: {
    headers: MarkdownSpan[][],
    rows: MarkdownSpan[][][],
    onLinkPress: (url: string) => void,
    selectable: boolean,
}) => {
    const columnCount = props.headers.length;
    const rowCount = props.rows.length;
    const isLastRow = (rowIndex: number) => rowIndex === rowCount - 1;

    return (
        <View style={style.tableContainer}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
                nestedScrollEnabled={true}
                style={style.tableScrollView}
            >
                <View style={style.tableContent}>
                    {/* Render each column as a vertical container */}
                    {props.headers.map((header, colIndex) => (
                        <View
                            key={`column-${colIndex}`}
                            style={[
                                style.tableColumn,
                                colIndex === columnCount - 1 && style.tableColumnLast
                            ]}
                        >
                            {/* Header cell for this column */}
                            <View style={[style.tableCell, style.tableHeaderCell, style.tableCellFirst]}>
                                <Text style={style.tableHeaderText}><RenderSpans spans={header} baseStyle={style.tableHeaderText} onLinkPress={props.onLinkPress} selectable={props.selectable} /></Text>
                            </View>
                            {/* Data cells for this column */}
                            {props.rows.map((row, rowIndex) => (
                                <View
                                    key={`cell-${rowIndex}-${colIndex}`}
                                    style={[
                                        style.tableCell,
                                        isLastRow(rowIndex) && style.tableCellLast
                                    ]}
                                >
                                    <Text style={style.tableCellText}><RenderSpans spans={row[colIndex] ?? []} baseStyle={style.tableCellText} onLinkPress={props.onLinkPress} selectable={props.selectable} /></Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
});


const style = StyleSheet.create((theme) => ({

    // Plain text

    text: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        marginTop: 8,
        marginBottom: 8,
        color: theme.colors.text,
        fontWeight: '400',
    },

    italic: {
        fontStyle: 'italic',
    },
    bold: {
        fontWeight: 'bold',
    },
    semibold: {
        fontWeight: '600',
    },
    code: {
        ...Typography.mono(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },
    link: {
        ...Typography.default(),
        color: theme.colors.text,
        fontWeight: '400',
        textDecorationLine: 'underline',
        cursor: 'pointer',
    },

    // Headers

    header: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    header1: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 36 to 24
        fontWeight: '900',
        marginTop: 16,
        marginBottom: 8
    },
    header2: {
        fontSize: 20,
        lineHeight: 24,  // Reduced from 36 to 32
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8
    },
    header3: {
        fontSize: 16,
        lineHeight: 28,  // Reduced from 32 to 28
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    header4: {
        fontSize: 16,
        lineHeight: 24,
        fontWeight: '600',
        marginTop: 8,
        marginBottom: 8,
    },
    header5: {
        fontSize: 16,
        lineHeight: 24,  // Reduced from 28 to 24
        fontWeight: '600'
    },
    header6: {
        fontSize: 16,
        lineHeight: 24, // Reduced from 28 to 24
        fontWeight: '600'
    },

    //
    // List
    //

    list: {
        ...Typography.default(),
        color: theme.colors.text,
        marginTop: 0,
        marginBottom: 0,
    },

    //
    // Code Block
    //

    codeBlock: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        marginVertical: 8,
        position: 'relative',
        zIndex: 1,
    },
    copyButtonWrapper: {
        position: 'absolute',
        top: 8,
        right: 8,
        opacity: 0,
        zIndex: 10,
        elevation: 10,
        pointerEvents: 'none',
    },
    copyButtonWrapperVisible: {
        opacity: 1,
        pointerEvents: 'auto',
    },
    codeLanguage: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 8,
        paddingHorizontal: 16,
        marginBottom: 0,
    },
    codeText: {
        ...Typography.mono(),
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 20,
    },
    horizontalRule: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginTop: 8,
        marginBottom: 8,
    },
    imageBlock: {
        width: '100%',
        maxWidth: 520,
        marginVertical: 8,
        alignSelf: 'flex-start',
        gap: 8,
    },
    image: {
        width: '100%',
        minHeight: 160,
        height: 240,
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    imageCaption: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    copyButtonContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        elevation: 10,
        opacity: 1,
    },
    copyButtonContainerHidden: {
        opacity: 0,
    },
    copyButton: {
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        cursor: 'pointer',
    },
    copyButtonHidden: {
        display: 'none',
    },
    copyButtonCopied: {
        backgroundColor: theme.colors.success,
        borderColor: theme.colors.success,
        opacity: 1,
    },
    copyButtonText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 12,
        lineHeight: 16,
    },

    //
    // Options Block
    //

    optionsContainer: {
        flexDirection: 'column',
        gap: 8,
        marginVertical: 8,
    },
    optionItem: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    optionItemPressed: {
        opacity: 0.7,
        backgroundColor: theme.colors.surfaceHigh,
    },
    optionText: {
        ...Typography.default(),
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.text,
    },

    //
    // Table
    //

    tableContainer: {
        marginVertical: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        overflow: 'hidden',
        alignSelf: 'flex-start',
    },
    tableScrollView: {
        flexGrow: 0,
    },
    tableContent: {
        flexDirection: 'row',
    },
    tableColumn: {
        flexDirection: 'column',
        borderRightWidth: 1,
        borderRightColor: theme.colors.divider,
    },
    tableColumnLast: {
        borderRightWidth: 0,
    },
    tableCell: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        alignItems: 'flex-start',
    },
    tableCellFirst: {
        borderTopWidth: 0,
    },
    tableCellLast: {
        borderBottomWidth: 0,
    },
    tableHeaderCell: {
        backgroundColor: theme.colors.surfaceHigh,
    },
    tableHeaderText: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
    },
    tableCellText: {
        ...Typography.default(),
        color: theme.colors.text,
        fontSize: 16,
        lineHeight: 24,
    },

}));
