import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ApiDeleteSession,
  ApiUpdateContainer,
  ApiUpdateNewSession,
  ApiUpdateSessionState,
} from './apiTypes';
import {
  handleRealtimeDeleteSessionUpdate,
  handleRealtimeNewSessionUpdate,
  handleRealtimeUpdateSessionState,
  type SessionRealtimeUpdateDependencies,
} from './sessionRealtimeSessionUpdate';
import type { Session } from './storageTypes';

function createSession(id: string): Session {
  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: false,
    activeAt: 1,
    metadata: { path: '/tmp', host: 'host', machineId: 'machine-1' },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence: 1,
  };
}

function createDeps(): SessionRealtimeUpdateDependencies {
  return {
    decryptSessions: vi.fn(async () => []),
    applySessions: vi.fn(),
    invalidateSessions: vi.fn(),
    getSession: vi.fn(() => createSession('session-1')),
    getSessionEncryption: vi.fn(() => ({
      decryptAgentState: vi.fn(async (_v, value) => value ? { controlledByUser: true, requests: {} } : null),
      decryptMetadata: vi.fn(async () => ({ path: '/tmp', host: 'host', machineId: 'machine-1' })),
    })),
    isSessionVisible: vi.fn(() => true),
    invalidateMessages: vi.fn(),
    invalidateGitStatus: vi.fn(),
    rememberDeletedSessionHints: vi.fn(),
    deleteSession: vi.fn(),
    removeSessionEncryption: vi.fn(),
    removeProjectSession: vi.fn(),
    clearGitStatus: vi.fn(),
    clearSessionCaches: vi.fn(),
    onPermissionRequested: vi.fn(),
    onMissingSessionEncryption: vi.fn(),
    didSessionControlReturnToApp: vi.fn(() => false),
  };
}

describe('sessionRealtimeSessionUpdate', () => {
  let deps: SessionRealtimeUpdateDependencies;

  beforeEach(() => {
    deps = createDeps();
  });

  it('applies a decrypted new session', async () => {
    (deps.decryptSessions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([createSession('session-2')]);
    const update: ApiUpdateContainer & { body: ApiUpdateNewSession } = {
      id: 'u1',
      seq: 1,
      createdAt: 1,
      body: {
        t: 'new-session',
        id: 'session-2',
        seq: 1,
        metadata: 'encrypted',
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        dataEncryptionKey: null,
        active: false,
        activeAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    };

    await handleRealtimeNewSessionUpdate(update, deps);

    expect(deps.applySessions).toHaveBeenCalledWith([expect.objectContaining({ id: 'session-2' })]);
  });

  it('deletes session state and caches together', () => {
    const update: ApiUpdateContainer & { body: ApiDeleteSession } = {
      id: 'u2',
      seq: 2,
      createdAt: 2,
      body: { t: 'delete-session', sid: 'session-1' },
    };

    handleRealtimeDeleteSessionUpdate(update, deps);

    expect(deps.rememberDeletedSessionHints).toHaveBeenCalled();
    expect(deps.deleteSession).toHaveBeenCalledWith('session-1');
    expect(deps.removeSessionEncryption).toHaveBeenCalledWith('session-1');
    expect(deps.removeProjectSession).toHaveBeenCalledWith('session-1');
    expect(deps.clearGitStatus).toHaveBeenCalledWith('session-1');
    expect(deps.clearSessionCaches).toHaveBeenCalledWith('session-1');
  });

  it('applies updated session metadata and invalidates git status', async () => {
    const update: ApiUpdateContainer & { body: ApiUpdateSessionState } = {
      id: 'u3',
      seq: 3,
      createdAt: 300,
      body: {
        t: 'update-session',
        id: 'session-1',
        agentState: { version: 2, value: 'encrypted-agent-state' },
        metadata: { version: 2, value: 'encrypted-metadata' },
      },
    };

    await handleRealtimeUpdateSessionState(update, deps);

    expect(deps.applySessions).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'session-1',
        seq: 3,
        updatedAt: 300,
        agentStateVersion: 2,
        metadataVersion: 2,
      }),
    ]);
    expect(deps.invalidateGitStatus).toHaveBeenCalledWith('session-1');
  });
});
