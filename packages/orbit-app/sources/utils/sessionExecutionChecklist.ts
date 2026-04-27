import type { Session, TodoItem } from '@/sync/storageTypes';

export type ExecutionChecklistItemStatus = 'completed' | 'running' | 'pending' | 'error';

export type ExecutionChecklistItem = {
    id: string;
    title: string;
    status: ExecutionChecklistItemStatus;
    source: 'todo';
};

export type ExecutionChecklist = {
    source: 'todos';
    completedCount: number;
    totalCount: number;
    hasActiveItem: boolean;
    items: ExecutionChecklistItem[];
};

export function buildSessionExecutionChecklist(params: {
    session: Pick<Session, 'todos' | 'thinking'>;
    messages: readonly unknown[];
    isSessionActive?: boolean;
    maxToolItems?: number;
    fallbackActiveTitle?: string;
}): ExecutionChecklist | null {
    return buildTodoChecklist(params.session.todos);
}

function buildTodoChecklist(todos: TodoItem[] | undefined): ExecutionChecklist | null {
    if (!todos?.length) {
        return null;
    }

    const items = todos
        .filter((todo) => todo.content.trim().length > 0)
        .map((todo, index): ExecutionChecklistItem => ({
            id: todo.id ?? `todo-${index}`,
            title: todo.content.trim(),
            status: todo.status === 'completed'
                ? 'completed'
                : todo.status === 'in_progress'
                    ? 'running'
                    : 'pending',
            source: 'todo',
        }));

    if (!items.length) {
        return null;
    }

    return {
        source: 'todos',
        completedCount: items.filter((item) => item.status === 'completed').length,
        totalCount: items.length,
        hasActiveItem: items.some((item) => item.status === 'running' || item.status === 'pending'),
        items,
    };
}
