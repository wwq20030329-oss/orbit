import { describe, expect, it } from 'vitest';

import { buildSessionExecutionChecklist } from './sessionExecutionChecklist';
import type { Message } from '@/sync/typesMessage';

function createSession(overrides: Record<string, unknown> = {}) {
    return {
        thinking: false,
        todos: undefined,
        ...overrides,
    } as any;
}

function createToolMessage(params: {
    id: string;
    name: string;
    state?: 'running' | 'completed' | 'error';
    description?: string | null;
    input?: unknown;
    createdAt?: number;
}): Message {
    return {
        id: params.id,
        localId: null,
        createdAt: params.createdAt ?? 1,
        kind: 'tool-call',
        tool: {
            name: params.name,
            state: params.state ?? 'completed',
            input: params.input ?? {},
            createdAt: params.createdAt ?? 1,
            startedAt: params.createdAt ?? 1,
            completedAt: params.state === 'running' ? null : params.createdAt ?? 1,
            description: params.description ?? null,
        },
        children: [],
    };
}

describe('buildSessionExecutionChecklist', () => {
    it('uses session todos as the primary execution checklist', () => {
        const checklist = buildSessionExecutionChecklist({
            session: createSession({
                todos: [
                    { id: 'one', content: 'Inspect drawer loading', status: 'completed' },
                    { id: 'two', content: 'Polish project sessions', status: 'in_progress' },
                    { id: 'three', content: 'Run typecheck', status: 'pending' },
                ],
            }),
            messages: [
                createToolMessage({
                    id: 'tool-1',
                    name: 'Bash',
                    state: 'running',
                    input: { command: 'yarn test' },
                }),
            ],
        });

        expect(checklist).toMatchObject({
            source: 'todos',
            completedCount: 1,
            totalCount: 3,
            hasActiveItem: true,
        });
        expect(checklist?.items.map((item) => [item.title, item.status])).toEqual([
            ['Inspect drawer loading', 'completed'],
            ['Polish project sessions', 'running'],
            ['Run typecheck', 'pending'],
        ]);
    });

    it('does not summarize tool calls without an explicit plan', () => {
        const checklist = buildSessionExecutionChecklist({
            session: createSession({ thinking: true }),
            messages: [
                createToolMessage({
                    id: 'tool-new',
                    name: 'Edit',
                    state: 'running',
                    input: { file_path: '/Users/wwq/Desktop/claudeapp/App.tsx' },
                    createdAt: 3,
                }),
                createToolMessage({
                    id: 'tool-old',
                    name: 'Read',
                    state: 'completed',
                    input: { file_path: '/Users/wwq/Desktop/claudeapp/package.json' },
                    createdAt: 2,
                }),
                createToolMessage({
                    id: 'tool-hidden',
                    name: 'TodoWrite',
                    state: 'completed',
                    input: {},
                    createdAt: 1,
                }),
            ],
        });

        expect(checklist).toBeNull();
    });

    it('does not show stale tool-only progress for idle sessions', () => {
        const checklist = buildSessionExecutionChecklist({
            session: createSession({ thinking: false }),
            messages: [
                createToolMessage({
                    id: 'tool-1',
                    name: 'Read',
                    state: 'completed',
                    input: { file_path: '/tmp/old.txt' },
                }),
            ],
        });

        expect(checklist).toBeNull();
    });

    it('does not show a standalone thinking checklist without plan todos', () => {
        const checklist = buildSessionExecutionChecklist({
            session: createSession({ thinking: true }),
            messages: [],
            fallbackActiveTitle: '思考中',
        });

        expect(checklist).toBeNull();
    });
});
