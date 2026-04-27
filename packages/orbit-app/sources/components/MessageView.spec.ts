import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => {
        update: (node: React.ReactElement) => void;
        unmount: () => void;
    };
};

const hoisted = vi.hoisted(() => ({
    toolViewRenderCount: 0,
    markdownRenderCount: 0,
}));

vi.mock('react-native', () => ({
    Text: ({ children }: { children?: React.ReactNode }) => children ?? null,
    View: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (factory: any) => factory({
            colors: {
                text: '#111',
                textSecondary: '#666',
                surface: '#fff',
                surfacePressed: '#f6f6f6',
                divider: '#ddd',
                button: {
                    primary: { background: '#000', tint: '#fff' },
                },
                agentEventText: '#999',
            },
        }),
    },
}));

vi.mock('./markdown/MarkdownView', () => ({
    MarkdownContentView: () => {
        hoisted.markdownRenderCount += 1;
        return null;
    },
}));

vi.mock('./tools/ToolView', () => ({
    ToolView: () => {
        hoisted.toolViewRenderCount += 1;
        return null;
    },
}));

vi.mock('./layout', () => ({
    layout: { maxWidth: 640 },
}));

vi.mock('@/constants/Typography', () => ({
    Typography: {
        default: () => ({}),
    },
}));

vi.mock('@/text', () => ({
    t: (key: string, args?: { time?: string }) => (
        key === 'message.usageLimitUntil'
            ? `limit:${args?.time ?? ''}`
            : key
    ),
}));

import { MessageView } from './MessageView';

function createToolCallMessage() {
    return {
        id: 'tool-message-1',
        kind: 'tool-call',
        createdAt: 1,
        meta: null,
        tool: {
            name: 'CodexBash',
            state: 'running',
            createdAt: 1,
            input: {
                parsed_cmd: [{ type: 'read', name: '/tmp/example.txt' }],
            },
        },
        children: [],
    } as any;
}

describe('MessageView', () => {
    it('renders Codex usage-limit text as a compact event instead of markdown content', () => {
        hoisted.markdownRenderCount = 0;

        TestRenderer.act(() => {
            TestRenderer.create(React.createElement(MessageView, {
                message: {
                    id: 'limit-message-1',
                    localId: null,
                    kind: 'agent-text',
                    createdAt: 1,
                    text: "You've hit your usage limit. To get more access now, send a request to your admin or try again at 1:35 PM.",
                } as any,
                metadata: null,
                sessionId: 'session-1',
                markdownCopyV2: false,
            }));
        });

        expect(hoisted.markdownRenderCount).toBe(0);
    });

    it('skips tool rerenders when metadata changes are unrelated to tool rendering', () => {
        hoisted.toolViewRenderCount = 0;

        const message = createToolCallMessage();
        const baseMetadata = {
            flavor: 'codex',
            path: '/tmp',
            lifecycleState: 'running',
        } as any;

        let renderer!: {
            update: (node: React.ReactElement) => void;
            unmount: () => void;
        };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(MessageView, {
                message,
                metadata: baseMetadata,
                sessionId: 'session-1',
                markdownCopyV2: false,
            }));
        });

        expect(hoisted.toolViewRenderCount).toBe(1);

        TestRenderer.act(() => {
            renderer.update(React.createElement(MessageView, {
                message,
                metadata: {
                    ...baseMetadata,
                    lifecycleState: 'archived',
                },
                sessionId: 'session-1',
                markdownCopyV2: false,
            }));
        });

        expect(hoisted.toolViewRenderCount).toBe(1);

        TestRenderer.act(() => {
            renderer.unmount();
        });
    });
});
