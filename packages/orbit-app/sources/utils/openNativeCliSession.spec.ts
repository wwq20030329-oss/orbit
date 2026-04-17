import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => {
  const state = {
    sessions: {} as Record<string, Session>,
    sessionMessages: {} as Record<string, { messages?: unknown[] }>,
    nativeCliHistoryByMachine: {} as Record<string, NativeCliHistoryEntry[]>,
    machines: {} as Record<string, Machine>,
    applyNativeCliHistory: vi.fn(),
  };

  return {
    state,
    machineResumeNativeCliHistory: vi.fn(),
    refreshSessions: vi.fn(async () => undefined),
    waitForSessionReady: vi.fn(async () => true),
    refreshSessionMessages: vi.fn(async () => undefined),
    loadNativeCliRecoveryIdentifiers: vi.fn(() => ({})),
    loadNativeCliRecoveryResumeRequests: vi.fn(() => ({})),
    saveNativeCliRecoveryIdentifiers: vi.fn(),
    saveNativeCliRecoveryResumeRequests: vi.fn(),
    findExistingOrbitSessionIdForNativeEntry: vi.fn(),
    findViewableOrbitSessionIdForNativeEntry: vi.fn(),
    findReusableOrbitSessionIdForNativeEntry: vi.fn(),
    shouldReuseExistingOrbitSessionForNativeEntry: vi.fn(),
    hasMeaningfulSessionHistoryMessages: vi.fn(),
    findMatchingNativeCliEntryForSession: vi.fn(),
    findNativeCliEntryByIdentifier: vi.fn(),
    findNativeCliEntryForSession: vi.fn(),
    getNativeCliSessionTarget: vi.fn(),
    isExplicitNativeCliIdentifier: vi.fn(),
    isImportedNativeHistoryWrapperSession: vi.fn(),
    refreshNativeCliHistoryForMachine: vi.fn(),
  };
});

vi.mock('@/sync/ops', () => ({
  machineResumeNativeCliHistory: hoisted.machineResumeNativeCliHistory,
}));

vi.mock('@/sync/storage', () => ({
  storage: {
    getState: () => hoisted.state,
  },
}));

vi.mock('@/sync/persistence', () => ({
  loadNativeCliRecoveryIdentifiers: hoisted.loadNativeCliRecoveryIdentifiers,
  loadNativeCliRecoveryResumeRequests: hoisted.loadNativeCliRecoveryResumeRequests,
  saveNativeCliRecoveryIdentifiers: hoisted.saveNativeCliRecoveryIdentifiers,
  saveNativeCliRecoveryResumeRequests: hoisted.saveNativeCliRecoveryResumeRequests,
}));

vi.mock('@/sync/sync', () => ({
  sync: {
    refreshSessions: hoisted.refreshSessions,
    waitForSessionReady: hoisted.waitForSessionReady,
    refreshSessionMessages: hoisted.refreshSessionMessages,
  },
}));

vi.mock('@/utils/nativeCliHistory', () => ({
  findExistingOrbitSessionIdForNativeEntry: hoisted.findExistingOrbitSessionIdForNativeEntry,
  findViewableOrbitSessionIdForNativeEntry: hoisted.findViewableOrbitSessionIdForNativeEntry,
  findReusableOrbitSessionIdForNativeEntry: hoisted.findReusableOrbitSessionIdForNativeEntry,
  shouldReuseExistingOrbitSessionForNativeEntry: hoisted.shouldReuseExistingOrbitSessionForNativeEntry,
  hasMeaningfulSessionHistoryMessages: hoisted.hasMeaningfulSessionHistoryMessages,
  findMatchingNativeCliEntryForSession: hoisted.findMatchingNativeCliEntryForSession,
}));

vi.mock('@/utils/nativeCliSessionResolver', () => ({
  findNativeCliEntryByIdentifier: hoisted.findNativeCliEntryByIdentifier,
  findNativeCliEntryForSession: hoisted.findNativeCliEntryForSession,
  getNativeCliSessionTarget: hoisted.getNativeCliSessionTarget,
  isExplicitNativeCliIdentifier: hoisted.isExplicitNativeCliIdentifier,
  isImportedNativeHistoryWrapperSession: hoisted.isImportedNativeHistoryWrapperSession,
}));

vi.mock('@/utils/nativeCliHistoryRefresh', () => ({
  refreshNativeCliHistoryForMachine: hoisted.refreshNativeCliHistoryForMachine,
}));

import {
  findOrbitSessionIdForNativeIdentifier,
  getRememberedNativeCliIdentifier,
  getRememberedNativeCliResumeRequest,
  isSessionOpenedAsHistoryOnly,
  openNativeCliHistoryEntry,
  primeNativeCliHistoryEntryOpen,
  resolveCanonicalSessionId,
  resolveExistingCanonicalSessionId,
  openNativeCliSessionFromIdentifier,
  openNativeCliSessionFromSession,
  resetSessionOpenedAsHistoryOnlyForTests,
  rememberNativeCliHintsForSession,
} from './openNativeCliSession';

function createSession(
  id: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: false,
    activeAt: 1,
    metadata: {
      machineId: 'machine-1',
      codexThreadId: 'thread-1',
      path: '/Users/test/project',
      host: 'wwq-mac',
      flavor: 'codex',
      lifecycleState: 'idle',
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

function createMachine(
  id: string,
  overrides: Partial<Machine> = {},
): Machine {
  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: true,
    activeAt: 1,
    metadata: {
      host: 'wwq-mac',
      platform: 'darwin',
      orbitCliVersion: '1.0.0',
      orbitHomeDir: '/Users/test/.orbit',
      homeDir: '/Users/test',
      ...overrides.metadata,
    },
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 0,
    ...overrides,
  };
}

function deriveNativeCliSessionTarget(session: Session) {
  const machineId = session.metadata?.machineId;
  if (!machineId) {
    return null;
  }

  if (session.metadata?.codexThreadId) {
    return {
      machineId,
      tool: 'codex' as const,
      backendId: session.metadata.codexThreadId,
      workingDirectory: session.metadata?.path ?? null,
      projectRoot: session.metadata?.projectRoot ?? null,
    };
  }

  if (session.metadata?.claudeSessionId) {
    return {
      machineId,
      tool: 'claude' as const,
      backendId: session.metadata.claudeSessionId,
      workingDirectory: session.metadata?.path ?? null,
      projectRoot: session.metadata?.projectRoot ?? null,
    };
  }

  if (session.metadata?.geminiSessionId) {
    return {
      machineId,
      tool: 'gemini' as const,
      backendId: session.metadata.geminiSessionId,
      workingDirectory: session.metadata?.path ?? null,
      projectRoot: session.metadata?.projectRoot ?? null,
    };
  }

  return null;
}

describe('openNativeCliHistoryEntry', () => {
  const entry: NativeCliHistoryEntry = {
    id: 'codex:thread-1',
    tool: 'codex',
    backendId: 'thread-1',
    machineId: 'machine-1',
    workingDirectory: '/Users/test/project',
    projectRoot: '/Users/test/project',
    title: 'project',
    summary: null,
    updatedAt: 100,
    isLive: false,
  };

  beforeEach(() => {
    resetSessionOpenedAsHistoryOnlyForTests();
    hoisted.state.sessions = {
      'wrapper-1': createSession('wrapper-1', {
        presence: 1,
      }),
      'resumed-1': createSession('resumed-1', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
        },
      }),
    };
    hoisted.state.nativeCliHistoryByMachine = {
      'machine-1': [entry],
    };
    hoisted.state.sessionMessages = {};
    hoisted.state.machines = {};

    hoisted.machineResumeNativeCliHistory.mockReset();
    hoisted.refreshSessions.mockReset();
    hoisted.waitForSessionReady.mockReset();
    hoisted.refreshSessionMessages.mockReset();
    hoisted.loadNativeCliRecoveryIdentifiers.mockReset();
    hoisted.loadNativeCliRecoveryResumeRequests.mockReset();
    hoisted.saveNativeCliRecoveryIdentifiers.mockReset();
    hoisted.saveNativeCliRecoveryResumeRequests.mockReset();
    hoisted.state.applyNativeCliHistory.mockReset();
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReset();
    hoisted.findViewableOrbitSessionIdForNativeEntry.mockReset();
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReset();
    hoisted.shouldReuseExistingOrbitSessionForNativeEntry.mockReset();
    hoisted.hasMeaningfulSessionHistoryMessages.mockReset();
    hoisted.findMatchingNativeCliEntryForSession.mockReset();
    hoisted.findNativeCliEntryByIdentifier.mockReset();
    hoisted.findNativeCliEntryForSession.mockReset();
    hoisted.getNativeCliSessionTarget.mockReset();
    hoisted.isExplicitNativeCliIdentifier.mockReset();
    hoisted.isImportedNativeHistoryWrapperSession.mockReset();
    hoisted.refreshNativeCliHistoryForMachine.mockReset();

    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');
    hoisted.findViewableOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.shouldReuseExistingOrbitSessionForNativeEntry.mockReturnValue(false);
    hoisted.hasMeaningfulSessionHistoryMessages.mockReturnValue(false);
    hoisted.findMatchingNativeCliEntryForSession.mockReturnValue(null);
    hoisted.isExplicitNativeCliIdentifier.mockImplementation((identifier: string) => (
      /^(?:native-session:)?(?:claude|codex|gemini):/.test(identifier)
    ));
    hoisted.isImportedNativeHistoryWrapperSession.mockImplementation((session: Session) => (
      Boolean(
        session.metadata?.nativeHistorySourceTool
        && session.metadata?.nativeHistorySourceBackendId
        && !session.metadata?.claudeSessionId
        && !session.metadata?.codexThreadId
        && !session.metadata?.geminiSessionId,
      )
    ));
    hoisted.getNativeCliSessionTarget.mockImplementation((session: Session) => (
      deriveNativeCliSessionTarget(session)
    ));
    hoisted.loadNativeCliRecoveryIdentifiers.mockReturnValue({});
    hoisted.loadNativeCliRecoveryResumeRequests.mockReturnValue({});
    hoisted.machineResumeNativeCliHistory.mockResolvedValue({
      type: 'success',
      sessionId: 'resumed-1',
    });
    hoisted.waitForSessionReady.mockResolvedValue(true);
  });

  it('makes resumed native history interactive when the existing wrapper session is not reusable', async () => {
    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });

    expect(result).toBe('resumed-1');
    expect(isSessionOpenedAsHistoryOnly('resumed-1')).toBe(false);
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledWith({
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      workingDirectory: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 100,
    });
  });

  it('reuses an existing Orbit session when it is marked reusable', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');

    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });

    expect(result).toBe('wrapper-1');
    expect(isSessionOpenedAsHistoryOnly('wrapper-1')).toBe(true);
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(0);
  });

  it('keeps a history-only wrapper session pinned to itself during canonical resolution', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');

    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });
    expect(result).toBe('wrapper-1');

    hoisted.refreshSessions.mockClear();

    expect(resolveExistingCanonicalSessionId('wrapper-1')).toBe('wrapper-1');
    await expect(resolveCanonicalSessionId('wrapper-1')).resolves.toBe('wrapper-1');
    expect(hoisted.refreshSessions).not.toHaveBeenCalled();
  });

  it('does not perform an extra pre-refresh before resolving an explicit native identifier', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.state.sessions = {};
    hoisted.findNativeCliEntryByIdentifier.mockImplementation((identifier: string, entries: NativeCliHistoryEntry[]) => {
      return entries.find((candidate) => candidate.id === identifier) ?? null;
    });
    hoisted.waitForSessionReady.mockImplementation(async () => {
      hoisted.state.sessions['resumed-1'] = createSession('resumed-1', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
        },
      });
      return true;
    });

    await expect(resolveCanonicalSessionId('codex:thread-1')).resolves.toBe('resumed-1');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalled();
    expect(hoisted.waitForSessionReady).toHaveBeenCalledWith('resumed-1');
    expect(hoisted.machineResumeNativeCliHistory.mock.invocationCallOrder[0]).toBeLessThan(
      hoisted.waitForSessionReady.mock.invocationCallOrder[0],
    );
  });

  it('does not short-circuit to a daemon-started reusable wrapper session', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');
    hoisted.state.sessions['wrapper-1'] = createSession('wrapper-1', {
      active: false,
      activeAt: 1,
      presence: 1,
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        projectRoot: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'claude',
        startedBy: 'daemon',
        startedFromDaemon: true,
        nativeHistorySourceTool: 'claude',
        nativeHistorySourceBackendId: 'thread-1',
      },
    });

    const result = await openNativeCliHistoryEntry({
      ...entry,
      tool: 'claude',
      id: 'claude:thread-1',
    }, { refreshHistory: false });

    expect(result).toBe('resumed-1');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('prefers resuming a live native history entry over opening a stale viewable wrapper', async () => {
    hoisted.findViewableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');

    const result = await openNativeCliHistoryEntry({
      ...entry,
      isLive: true,
    }, { refreshHistory: false });

    expect(result).toBe('resumed-1');
    expect(isSessionOpenedAsHistoryOnly('resumed-1')).toBe(false);
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('falls back to a viewable wrapper for live entries when native resume is unavailable', async () => {
    hoisted.findViewableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');
    hoisted.machineResumeNativeCliHistory.mockResolvedValueOnce({
      type: 'error',
      errorMessage: 'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.',
    });

    const result = await openNativeCliHistoryEntry({
      ...entry,
      isLive: true,
    }, { refreshHistory: false });

    expect(result).toBe('wrapper-1');
    expect(isSessionOpenedAsHistoryOnly('wrapper-1')).toBe(true);
    expect(hoisted.refreshNativeCliHistoryForMachine).not.toHaveBeenCalled();
  });

  it('marks non-live viewable wrapper sessions as history-only', async () => {
    hoisted.findViewableOrbitSessionIdForNativeEntry.mockReturnValue('wrapper-1');

    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });

    expect(result).toBe('wrapper-1');
    expect(isSessionOpenedAsHistoryOnly('wrapper-1')).toBe(true);
    expect(hoisted.machineResumeNativeCliHistory).not.toHaveBeenCalled();
  });

  it('waits for the resumed session to become locally ready without blocking on a full session refresh', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    let releaseReady: () => void = () => {};
    let readinessBlocked = false;
    hoisted.waitForSessionReady.mockImplementation(() => new Promise<boolean>((resolve) => {
      readinessBlocked = true;
      releaseReady = () => resolve(true);
    }));

    const resultPromise = openNativeCliHistoryEntry(entry, { refreshHistory: false });
    let resolved = false;
    void resultPromise.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hoisted.waitForSessionReady).toHaveBeenCalledWith('resumed-1');
    expect(readinessBlocked).toBe(true);
    expect(resolved).toBe(false);

    releaseReady();

    await expect(resultPromise).resolves.toBe('resumed-1');
  });

  it('reuses an in-flight native history open that was primed from the list tap', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    let releaseReady: () => void = () => {};
    hoisted.waitForSessionReady.mockImplementation(() => new Promise<boolean>((resolve) => {
      releaseReady = () => resolve(true);
    }));

    const primedPromise = primeNativeCliHistoryEntryOpen(entry);
    await Promise.resolve();

    const resolvedPromise = resolveCanonicalSessionId('codex:thread-1');
    releaseReady();

    await expect(primedPromise).resolves.toBe('resumed-1');
    await expect(resolvedPromise).resolves.toBe('resumed-1');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('returns after local session readiness without waiting for message warmup to finish', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.state.sessions['resumed-1'] = createSession('resumed-1', {
      presence: 1,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
      },
    });
    hoisted.waitForSessionReady.mockImplementation(async () => {
      hoisted.state.sessions['resumed-1'] = createSession('resumed-1', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
        },
      });
      return true;
    });

    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toBe('resumed-1');
    expect(hoisted.waitForSessionReady).toHaveBeenCalledWith('resumed-1');
  });

  it('can return a resumed session even if message warmup would still be pending', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.state.sessions['resumed-1'] = createSession('resumed-1', {
      active: true,
      activeAt: Date.now(),
      presence: 'online',
    });

    let releaseMessageRefresh: () => void = () => {};
    hoisted.refreshSessionMessages.mockImplementation(() => new Promise<undefined>((resolve) => {
      releaseMessageRefresh = () => resolve(undefined);
    }));

    const result = await openNativeCliHistoryEntry(entry, { refreshHistory: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toBe('resumed-1');
    expect(hoisted.waitForSessionReady).toHaveBeenCalledWith('resumed-1');

    releaseMessageRefresh();
    await Promise.resolve();
  });

  it('preserves the original resume error when refreshed machine history no longer lists the entry', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.machineResumeNativeCliHistory
      .mockResolvedValueOnce({
        type: 'error',
        errorMessage: 'Socket has been disconnected',
      });
    hoisted.refreshNativeCliHistoryForMachine.mockResolvedValue([]);

    await expect(openNativeCliHistoryEntry(entry)).rejects.toMatchObject({
      message: 'Socket has been disconnected',
    });
    expect(hoisted.state.applyNativeCliHistory).not.toHaveBeenCalled();
  });

  it('does not retry history refresh when native CLI resume is unavailable on the machine', async () => {
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.machineResumeNativeCliHistory.mockResolvedValueOnce({
      type: 'error',
      errorMessage: 'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.',
    });

    await expect(openNativeCliHistoryEntry(entry)).rejects.toMatchObject({
      message: 'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.',
    });
    expect(hoisted.refreshNativeCliHistoryForMachine).not.toHaveBeenCalled();
  });

  it('prefers the newest online session when a stale running wrapper id points at the same backend', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue('running-session');
    const runningSession = createSession('running-session', {
      active: false,
      activeAt: 1,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
      },
    });
    hoisted.state.sessions = {
      'running-session': runningSession,
      'resumed-1': createSession('resumed-1', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
      }),
    };

    const result = await openNativeCliSessionFromIdentifier('running-session');

    expect(result).toBe('resumed-1');
  });

  it('ignores native live mirror sessions when resolving an online native identifier', () => {
    hoisted.state.sessions = {
      'mirror-session': createSession('mirror-session', {
        updatedAt: 10,
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
          startedBy: 'daemon',
          startedFromDaemon: true,
          sessionRole: 'native-live-mirror',
        },
      }),
      'real-session': createSession('real-session', {
        updatedAt: 5,
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
          startedBy: 'terminal',
        },
      }),
    };

    expect(findOrbitSessionIdForNativeIdentifier(
      'codex:thread-1',
      hoisted.state.sessions,
      { requireOnline: true },
    )).toBe('real-session');
  });

  it('prefers a terminal-started online session over a daemon-started online session for the same backend', () => {
    hoisted.state.sessions = {
      'daemon-session': createSession('daemon-session', {
        updatedAt: 20,
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
          startedBy: 'daemon',
          startedFromDaemon: true,
        },
      }),
      'terminal-session': createSession('terminal-session', {
        updatedAt: 10,
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
          startedBy: 'terminal',
        },
      }),
    };

    expect(findOrbitSessionIdForNativeIdentifier(
      'codex:thread-1',
      hoisted.state.sessions,
      { requireOnline: true },
    )).toBe('terminal-session');
  });

  it('remaps an old wrapper session id to the newest online session for the same native backend', () => {
    hoisted.state.sessions = {
      'old-wrapper': createSession('old-wrapper', {
        updatedAt: 10,
        active: false,
        activeAt: 1,
        presence: 1,
        metadata: {
          machineId: 'machine-1',
          claudeSessionId: 'claude-thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'claude',
          lifecycleState: 'idle',
          startedBy: 'daemon',
          startedFromDaemon: true,
        },
      }),
      'new-live-session': createSession('new-live-session', {
        updatedAt: 20,
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          claudeSessionId: 'claude-thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'claude',
          lifecycleState: 'running',
          startedBy: 'daemon',
          startedFromDaemon: true,
        },
      }),
    };

    expect(findOrbitSessionIdForNativeIdentifier(
      'old-wrapper',
      hoisted.state.sessions,
      { requireOnline: false },
    )).toBe('new-live-session');
  });

  it('resolves a synthesized route session id when the existing session is reusable', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue('orbit-route-session');
    const runningSession = createSession('orbit-route-session', {
      active: false,
      activeAt: 1,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
      },
    });

    hoisted.state.sessions = {
      'orbit-route-session': runningSession,
    };

    const result = await openNativeCliSessionFromIdentifier('codex:session:orbit-route-session');

    expect(result).toBe('orbit-route-session');
  });

  it('does not short-circuit synthesized route ids to an unreusable wrapper session', async () => {
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.findNativeCliEntryByIdentifier.mockImplementation((identifier: string, entries: NativeCliHistoryEntry[]) => {
      return entries.find((candidate) => candidate.id === identifier) ?? null;
    });

    hoisted.state.sessions = {
      'orbit-route-session': createSession('orbit-route-session', {
        active: false,
        activeAt: 1,
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'idle',
          startedBy: 'daemon',
        },
      }),
      'resumed-1': createSession('resumed-1', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
        },
      }),
    };
    hoisted.state.nativeCliHistoryByMachine = {
      'machine-1': [{
        ...entry,
        id: 'codex:session:orbit-route-session',
      }],
    };

    const result = await openNativeCliSessionFromIdentifier('codex:session:orbit-route-session');

    expect(result).toBe('resumed-1');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('can resume from a remembered request when machine history no longer lists the identifier', async () => {
    const session = createSession('deleted-wrapper-imported', {
      updatedAt: 456,
      metadata: {
        machineId: 'machine-7',
        path: '/Users/test/project-imported',
        projectRoot: '/Users/test/project-imported',
        host: 'wwq-mac',
        flavor: 'codex',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-imported-1',
        nativeHistoryImportedAt: 400,
      },
    });

    rememberNativeCliHintsForSession(session);
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.findNativeCliEntryByIdentifier.mockReturnValue(null);
    hoisted.refreshNativeCliHistoryForMachine.mockResolvedValue([]);
    hoisted.machineResumeNativeCliHistory.mockResolvedValueOnce({
      type: 'success',
      sessionId: 'resumed-imported-1',
    });

    const result = await openNativeCliSessionFromIdentifier('codex:thread-imported-1');

    expect(result).toBe('resumed-imported-1');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledWith({
      machineId: 'machine-7',
      tool: 'codex',
      backendId: 'thread-imported-1',
      workingDirectory: '/Users/test/project-imported',
      title: 'project-imported',
      summary: null,
      updatedAt: 456,
    });
  });

});

describe('rememberNativeCliHintsForSession', () => {
  it('keeps enough native CLI metadata to recover a deleted wrapper session later', () => {
    const session = createSession('deleted-wrapper-1', {
      updatedAt: 321,
      metadata: {
        machineId: 'machine-9',
        codexThreadId: 'thread-deleted-1',
        path: '/Users/test/project-deleted',
        projectRoot: '/Users/test/project-deleted',
        host: 'wwq-mac',
        flavor: 'codex',
      },
    });

    rememberNativeCliHintsForSession(session);

    expect(getRememberedNativeCliIdentifier('deleted-wrapper-1')).toBe('codex:thread-deleted-1');
    expect(getRememberedNativeCliResumeRequest('deleted-wrapper-1')).toEqual({
      machineId: 'machine-9',
      tool: 'codex',
      backendId: 'thread-deleted-1',
      workingDirectory: '/Users/test/project-deleted',
      title: 'project-deleted',
      summary: null,
      updatedAt: 321,
    });
  });

  it('falls back to imported native history metadata when direct backend ids are missing', () => {
    const session = createSession('deleted-wrapper-imported', {
      updatedAt: 456,
      metadata: {
        machineId: 'machine-7',
        path: '/Users/test/project-imported',
        projectRoot: '/Users/test/project-imported',
        host: 'wwq-mac',
        flavor: 'codex',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-imported-1',
        nativeHistoryImportedAt: 400,
      },
    });

    rememberNativeCliHintsForSession(session);

    expect(getRememberedNativeCliIdentifier('deleted-wrapper-imported')).toBe('codex:thread-imported-1');
    expect(getRememberedNativeCliResumeRequest('deleted-wrapper-imported')).toEqual({
      machineId: 'machine-7',
      tool: 'codex',
      backendId: 'thread-imported-1',
      workingDirectory: '/Users/test/project-imported',
      title: 'project-imported',
      summary: null,
      updatedAt: 456,
    });
  });
});

describe('openNativeCliSessionFromSession', () => {
  beforeEach(() => {
    hoisted.state.sessions = {};
    hoisted.state.sessionMessages = {};
    hoisted.state.nativeCliHistoryByMachine = {};
    hoisted.state.machines = {
      'machine-1': createMachine('machine-1'),
    };

    hoisted.machineResumeNativeCliHistory.mockReset();
    hoisted.refreshSessions.mockReset();
    hoisted.waitForSessionReady.mockReset();
    hoisted.refreshSessionMessages.mockReset();
    hoisted.findExistingOrbitSessionIdForNativeEntry.mockReset();
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReset();
    hoisted.shouldReuseExistingOrbitSessionForNativeEntry.mockReset();
    hoisted.hasMeaningfulSessionHistoryMessages.mockReset();
    hoisted.findMatchingNativeCliEntryForSession.mockReset();
    hoisted.findNativeCliEntryByIdentifier.mockReset();
    hoisted.findNativeCliEntryForSession.mockReset();
    hoisted.getNativeCliSessionTarget.mockReset();
    hoisted.isExplicitNativeCliIdentifier.mockReset();
    hoisted.refreshNativeCliHistoryForMachine.mockReset();

    hoisted.machineResumeNativeCliHistory.mockResolvedValue({
      type: 'success',
      sessionId: 'resumed-from-wrapper',
    });
    hoisted.findReusableOrbitSessionIdForNativeEntry.mockReturnValue(null);
    hoisted.findMatchingNativeCliEntryForSession.mockReturnValue(null);
    hoisted.isExplicitNativeCliIdentifier.mockImplementation((identifier: string) => (
      /^(?:native-session:)?(?:claude|codex|gemini):/.test(identifier)
    ));
    hoisted.getNativeCliSessionTarget.mockImplementation((session: Session) => (
      deriveNativeCliSessionTarget(session)
    ));
    hoisted.waitForSessionReady.mockImplementation(async () => {
      hoisted.state.sessions['resumed-from-wrapper'] = createSession('resumed-from-wrapper', {
        active: true,
        activeAt: Date.now(),
        presence: 'online',
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-legacy',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'running',
        },
      });
      return true;
    });
  });

  it('resumes a legacy wrapper session without machineId by inferring the machine from host', async () => {
    const legacySession = createSession('wrapper-legacy', {
      metadata: {
        machineId: undefined,
        codexThreadId: 'thread-legacy',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
      },
      presence: 1,
    });

    const result = await openNativeCliSessionFromSession(legacySession);

    expect(result).toBe('resumed-from-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledWith({
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-legacy',
      workingDirectory: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 1,
    });
  });

  it('does not treat an online native live mirror as a usable chat session', async () => {
    const mirrorSession = createSession('mirror-session', {
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-legacy',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
        startedBy: 'daemon',
        startedFromDaemon: true,
        sessionRole: 'native-live-mirror',
      },
    });

    const result = await openNativeCliSessionFromSession(mirrorSession);

    expect(result).toBe('resumed-from-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('does not trust stale running native sessions as directly chat-ready', async () => {
    const staleRunningSession = createSession('stale-running-session', {
      active: false,
      activeAt: 1,
      presence: 1,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-legacy',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
        startedBy: 'terminal',
      },
    });

    const result = await openNativeCliSessionFromSession(staleRunningSession);

    expect(result).toBe('resumed-from-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledTimes(1);
  });

  it('reuses an online daemon-started direct native session when it is already attached', async () => {
    const daemonWrapper = createSession('daemon-wrapper', {
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-legacy',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
        startedBy: 'daemon',
        startedFromDaemon: true,
      },
    });

    const result = await openNativeCliSessionFromSession(daemonWrapper);

    expect(result).toBe('daemon-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).not.toHaveBeenCalled();
  });

  it('does not trust imported native-history wrappers as directly chat-ready even when online', async () => {
    const importedWrapper = createSession('imported-wrapper', {
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-7',
        path: '/Users/test/project-imported',
        projectRoot: '/Users/test/project-imported',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-imported-1',
        nativeHistoryImportedAt: 400,
      },
    });
    hoisted.state.machines = {
      'machine-7': createMachine('machine-7'),
    };
    hoisted.machineResumeNativeCliHistory.mockResolvedValueOnce({
      type: 'success',
      sessionId: 'resumed-imported-wrapper',
    });

    const result = await openNativeCliSessionFromSession(importedWrapper);

    expect(result).toBe('resumed-imported-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledWith({
      machineId: 'machine-7',
      tool: 'codex',
      backendId: 'thread-imported-1',
      workingDirectory: '/Users/test/project-imported',
      title: 'project-imported',
      summary: null,
      updatedAt: 1,
    });
  });

  it('reuses an online direct native session after history resume metadata has been attached', async () => {
    const resumedDirectSession = createSession('resumed-direct', {
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-7',
        codexThreadId: 'thread-imported-1',
        path: '/Users/test/project-imported',
        projectRoot: '/Users/test/project-imported',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
        startedBy: 'daemon',
        startedFromDaemon: true,
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-imported-1',
        nativeHistoryImportedAt: 400,
      },
    });

    const result = await openNativeCliSessionFromSession(resumedDirectSession);

    expect(result).toBe('resumed-direct');
    expect(hoisted.machineResumeNativeCliHistory).not.toHaveBeenCalled();
  });

  it('resumes a native-flavor wrapper by matching native history when no backend id is attached yet', async () => {
    hoisted.findMatchingNativeCliEntryForSession.mockReturnValue({
      id: 'claude:backend-1',
      tool: 'claude',
      backendId: 'backend-1',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 101,
      isLive: true,
    });

    const result = await openNativeCliSessionFromSession(createSession('wrapper-native', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'claude',
      },
    }));

    expect(result).toBe('resumed-from-wrapper');
    expect(hoisted.machineResumeNativeCliHistory).toHaveBeenCalledWith({
      machineId: 'machine-1',
      tool: 'claude',
      backendId: 'backend-1',
      workingDirectory: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 101,
    });
  });
});
