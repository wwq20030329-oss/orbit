import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { CliThreadListItem } from '@/utils/cliThreadList';
import type { Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
    sessions: {} as Record<string, Session>,
    findExistingOrbitSessionIdForNativeEntry: vi.fn(),
    openNativeCliHistoryEntry: vi.fn(),
    prepareNativeCliPlaceholderSession: vi.fn(),
    primeNativeCliHistoryEntryOpen: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({
            sessions: hoisted.sessions,
        }),
    },
}));

vi.mock('@/utils/nativeCliHistory', () => ({
    findExistingOrbitSessionIdForNativeEntry: hoisted.findExistingOrbitSessionIdForNativeEntry,
}));

vi.mock('@/utils/openNativeCliSession', () => ({
    openNativeCliHistoryEntry: hoisted.openNativeCliHistoryEntry,
    prepareNativeCliPlaceholderSession: hoisted.prepareNativeCliPlaceholderSession,
    primeNativeCliHistoryEntryOpen: hoisted.primeNativeCliHistoryEntryOpen,
}));

import { openCliThreadItem } from './openCliThreadItem';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: false,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'wwq-mac',
            flavor: 'claude',
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

describe('openCliThreadItem', () => {
    beforeEach(() => {
        hoisted.sessions = {};
        hoisted.findExistingOrbitSessionIdForNativeEntry.mockReset();
        hoisted.openNativeCliHistoryEntry.mockReset();
        hoisted.prepareNativeCliPlaceholderSession.mockReset();
        hoisted.primeNativeCliHistoryEntryOpen.mockReset();
        hoisted.openNativeCliHistoryEntry.mockResolvedValue(null);
        hoisted.primeNativeCliHistoryEntryOpen.mockResolvedValue(null);
    });

    it('opens session-backed items through navigateToSession', async () => {
        const navigateToSession = vi.fn(async () => undefined);
        const navigateDirectlyToSession = vi.fn();
        const item: CliThreadListItem = {
            id: 'claude:session-1',
            source: 'session',
            tool: 'claude',
            title: 'Session 1',
            updatedAt: 1,
            projectPath: '/Users/test/project',
            session: createSession(),
            entry: null,
        };

        await openCliThreadItem(item, {
            navigateToSession,
            navigateDirectlyToSession,
        });

        expect(navigateToSession).toHaveBeenCalledWith('session-1');
        expect(navigateDirectlyToSession).not.toHaveBeenCalled();
    });

    it('primes native thread recovery before opening the native identifier route when no placeholder exists', async () => {
        const navigateToSession = vi.fn(async () => undefined);
        const navigateDirectlyToSession = vi.fn();
        const item: CliThreadListItem = {
            id: 'codex:thread-1',
            source: 'native',
            tool: 'codex',
            title: 'Thread 1',
            updatedAt: 1,
            projectPath: '/Users/test/project',
            session: null,
            entry: {
                id: 'codex:thread-1',
                tool: 'codex',
                backendId: 'thread-1',
                machineId: 'machine-1',
                workingDirectory: '/Users/test/project',
                projectRoot: '/Users/test/project',
                title: 'Thread 1',
                summary: null,
                updatedAt: 1,
                isLive: false,
            },
        };

        hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);

        await openCliThreadItem(item, {
            navigateToSession,
            navigateDirectlyToSession,
        });

        expect(hoisted.primeNativeCliHistoryEntryOpen).toHaveBeenCalledWith(item.entry);
        expect(navigateDirectlyToSession).toHaveBeenCalledWith('codex:thread-1');
        expect(hoisted.openNativeCliHistoryEntry).not.toHaveBeenCalled();
        expect(navigateToSession).not.toHaveBeenCalled();
    });

    it('opens a matching placeholder session immediately and warms resume in the background', async () => {
        const navigateToSession = vi.fn(async () => undefined);
        const navigateDirectlyToSession = vi.fn();
        const item: CliThreadListItem = {
            id: 'codex:thread-1',
            source: 'native',
            tool: 'codex',
            title: 'Thread 1',
            updatedAt: 1,
            projectPath: '/Users/test/project',
            session: null,
            entry: {
                id: 'codex:thread-1',
                tool: 'codex',
                backendId: 'thread-1',
                machineId: 'machine-1',
                workingDirectory: '/Users/test/project',
                projectRoot: '/Users/test/project',
                title: 'Thread 1',
                summary: null,
                updatedAt: 1,
                isLive: false,
            },
        };

        hoisted.findExistingOrbitSessionIdForNativeEntry.mockImplementation((_entry, _sessions, options) => {
            if (options?.allowOffline === false) {
                return null;
            }

            return 'wrapper-1';
        });
        hoisted.openNativeCliHistoryEntry.mockResolvedValue('resumed-1');

        await openCliThreadItem(item, {
            navigateToSession,
            navigateDirectlyToSession,
        });
        await Promise.resolve();

        expect(hoisted.prepareNativeCliPlaceholderSession).toHaveBeenCalledWith('wrapper-1', item.entry);
        expect(navigateDirectlyToSession).toHaveBeenNthCalledWith(1, 'wrapper-1');
        expect(hoisted.openNativeCliHistoryEntry).toHaveBeenCalledWith(item.entry);
        expect(navigateDirectlyToSession).toHaveBeenNthCalledWith(2, 'resumed-1');
        expect(navigateToSession).not.toHaveBeenCalled();
    });

    it('prefers an already-online direct session over an older placeholder wrapper', async () => {
        const navigateToSession = vi.fn(async () => undefined);
        const navigateDirectlyToSession = vi.fn();
        const item: CliThreadListItem = {
            id: 'codex:thread-1',
            source: 'native',
            tool: 'codex',
            title: 'Thread 1',
            updatedAt: 1,
            projectPath: '/Users/test/project',
            session: null,
            entry: {
                id: 'codex:thread-1',
                tool: 'codex',
                backendId: 'thread-1',
                machineId: 'machine-1',
                workingDirectory: '/Users/test/project',
                projectRoot: '/Users/test/project',
                title: 'Thread 1',
                summary: null,
                updatedAt: 1,
                isLive: true,
            },
        };

        hoisted.findExistingOrbitSessionIdForNativeEntry.mockImplementation((_entry, _sessions, options) => {
            if (options?.allowOffline === false) {
                return 'resumed-1';
            }

            return 'wrapper-1';
        });

        await openCliThreadItem(item, {
            navigateToSession,
            navigateDirectlyToSession,
        });

        expect(navigateDirectlyToSession).toHaveBeenCalledWith('resumed-1');
        expect(hoisted.prepareNativeCliPlaceholderSession).not.toHaveBeenCalled();
        expect(hoisted.openNativeCliHistoryEntry).not.toHaveBeenCalled();
        expect(hoisted.primeNativeCliHistoryEntryOpen).not.toHaveBeenCalled();
        expect(navigateToSession).not.toHaveBeenCalled();
    });
});
