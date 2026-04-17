import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliThreadListItem, CliThreadProjectGroup } from './cliThreadList';
import type { NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
    sessions: {} as Record<string, Session>,
    nativeCliHistoryByMachine: {} as Record<string, NativeCliHistoryEntry[]>,
    applyNativeCliHistory: vi.fn(),
    deleteSession: vi.fn(),
    machineDeleteNativeCliHistory: vi.fn(),
    sessionDelete: vi.fn(),
    sessionKill: vi.fn(),
    findExistingOrbitSessionIdForNativeEntry: vi.fn(),
    getSessionCliTool: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            sessions: hoisted.sessions,
            nativeCliHistoryByMachine: hoisted.nativeCliHistoryByMachine,
            applyNativeCliHistory: hoisted.applyNativeCliHistory,
            deleteSession: hoisted.deleteSession,
        }),
    },
}));

vi.mock('@/sync/ops', () => ({
    machineDeleteNativeCliHistory: hoisted.machineDeleteNativeCliHistory,
    sessionDelete: hoisted.sessionDelete,
    sessionKill: hoisted.sessionKill,
}));

vi.mock('@/utils/nativeCliHistory', () => ({
    findExistingOrbitSessionIdForNativeEntry: hoisted.findExistingOrbitSessionIdForNativeEntry,
    getSessionCliTool: hoisted.getSessionCliTool,
}));

import { deleteCliProjectGroup, deleteCliThreadItem, findLinkedSessionForCliThreadItem } from './cliThreadDelete';

function createSession(id: string, overrides: Partial<Session> = {}): Session {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            host: 'wwq-mac',
            path: '/Users/test/project',
            flavor: 'claude',
            claudeSessionId: 'claude-backend-1',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 1,
        ...overrides,
    };
}

function createNativeItem(): CliThreadListItem {
    return {
        id: 'claude:claude-backend-1',
        source: 'native',
        tool: 'claude',
        title: 'Claude thread',
        updatedAt: 100,
        projectPath: '/Users/test/project',
        session: null,
        entry: {
            id: 'claude:claude-backend-1',
            tool: 'claude',
            backendId: 'claude-backend-1',
            machineId: 'machine-1',
            workingDirectory: '/Users/test/project',
            projectRoot: '/Users/test/project',
            title: 'Claude thread',
            summary: null,
            updatedAt: 100,
            isLive: false,
        },
    };
}

describe('cliThreadDelete', () => {
    beforeEach(() => {
        hoisted.sessions = {};
        hoisted.nativeCliHistoryByMachine = {};
        hoisted.applyNativeCliHistory.mockReset();
        hoisted.deleteSession.mockReset();
        hoisted.machineDeleteNativeCliHistory.mockReset();
        hoisted.sessionDelete.mockReset();
        hoisted.sessionKill.mockReset();
        hoisted.findExistingOrbitSessionIdForNativeEntry.mockReset();
        hoisted.getSessionCliTool.mockReset();

        hoisted.machineDeleteNativeCliHistory.mockResolvedValue({
            success: true,
            deletedCount: 1,
            deletedPaths: ['/tmp/deleted.jsonl'],
        });
        hoisted.sessionDelete.mockResolvedValue({ success: true });
        hoisted.sessionKill.mockResolvedValue({ success: true });
        hoisted.getSessionCliTool.mockReturnValue('claude');
    });

    it('finds the linked wrapper session for a native item', () => {
        const session = createSession('session-1');
        hoisted.sessions = { 'session-1': session };
        hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue('session-1');

        const linkedSession = findLinkedSessionForCliThreadItem(createNativeItem());

        expect(linkedSession?.id).toBe('session-1');
    });

    it('deletes both native history and the linked Orbit session for a native item', async () => {
        const session = createSession('session-1', {
            active: true,
            presence: 'online',
        });
        hoisted.sessions = { 'session-1': session };
        hoisted.nativeCliHistoryByMachine = {
            'machine-1': [createNativeItem().entry!],
        };
        hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue('session-1');

        await deleteCliThreadItem(createNativeItem());

        expect(hoisted.sessionKill).toHaveBeenCalledWith('session-1');
        expect(hoisted.machineDeleteNativeCliHistory).toHaveBeenCalledWith({
            machineId: 'machine-1',
            tool: 'claude',
            backendId: 'claude-backend-1',
            workingDirectory: '/Users/test/project',
        });
        expect(hoisted.applyNativeCliHistory).toHaveBeenCalledWith('machine-1', []);
        expect(hoisted.sessionDelete).toHaveBeenCalledWith('session-1');
        expect(hoisted.deleteSession).toHaveBeenCalledWith('session-1');
    });

    it('deletes linked native history for a session-only item before deleting the wrapper session', async () => {
        const session = createSession('session-1', {
            metadata: {
                machineId: 'machine-1',
                host: 'wwq-mac',
                path: '/Users/test/project',
                flavor: 'claude',
                claudeSessionId: 'claude-backend-1',
            },
        });
        const item: CliThreadListItem = {
            id: 'claude:session-1',
            source: 'session',
            tool: 'claude',
            title: 'Claude wrapper',
            updatedAt: 100,
            projectPath: '/Users/test/project',
            session,
            entry: null,
        };
        hoisted.nativeCliHistoryByMachine = {
            'machine-1': [createNativeItem().entry!],
        };

        await deleteCliThreadItem(item);

        expect(hoisted.machineDeleteNativeCliHistory).toHaveBeenCalledWith({
            machineId: 'machine-1',
            tool: 'claude',
            backendId: 'claude-backend-1',
            workingDirectory: '/Users/test/project',
        });
        expect(hoisted.applyNativeCliHistory).toHaveBeenCalledWith('machine-1', []);
        expect(hoisted.sessionDelete).toHaveBeenCalledWith('session-1');
    });

    it('deletes every thread in a project group', async () => {
        const itemA = createNativeItem();
        const itemB: CliThreadListItem = {
            ...createNativeItem(),
            id: 'claude:claude-backend-2',
            title: 'Claude thread 2',
            entry: {
                ...createNativeItem().entry!,
                id: 'claude:claude-backend-2',
                backendId: 'claude-backend-2',
                title: 'Claude thread 2',
            },
        };
        const project: CliThreadProjectGroup = {
            id: 'claude:project-1',
            tool: 'claude',
            machineId: 'machine-1',
            title: 'project',
            projectPath: '/Users/test/project',
            updatedAt: 100,
            threadCount: 2,
            liveThreadCount: 0,
            primaryItem: itemA,
            items: [itemA, itemB],
        };

        await deleteCliProjectGroup(project);

        expect(hoisted.machineDeleteNativeCliHistory).toHaveBeenCalledTimes(2);
    });
});
