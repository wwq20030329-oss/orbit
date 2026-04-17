import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
  getNativeCliSessionTarget: vi.fn(),
  openNativeCliSessionFromSession: vi.fn(),
}));

vi.mock('@/utils/nativeCliSessionResolver', () => ({
  getNativeCliSessionTarget: hoisted.getNativeCliSessionTarget,
}));

vi.mock('@/utils/openNativeCliSession', () => ({
  openNativeCliSessionFromSession: hoisted.openNativeCliSessionFromSession,
}));

import { resolveSendTargetSessionId } from './resolveSendTargetSession';

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
      path: '/Users/test/project',
      host: 'wwq-mac',
      flavor: 'codex',
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

describe('resolveSendTargetSessionId', () => {
  beforeEach(() => {
    hoisted.getNativeCliSessionTarget.mockReset();
    hoisted.openNativeCliSessionFromSession.mockReset();
  });

  it('uses the current session id for non-native sessions', async () => {
    const session = createSession('session-1', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'other',
      },
    });
    hoisted.getNativeCliSessionTarget.mockReturnValue(null);

    await expect(resolveSendTargetSessionId(session)).resolves.toBe('session-1');
    expect(hoisted.openNativeCliSessionFromSession).not.toHaveBeenCalled();
  });

  it('still resolves native-flavor sessions before a backend id is attached', async () => {
    const session = createSession('session-native', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'claude',
      },
    });
    hoisted.getNativeCliSessionTarget.mockReturnValue(null);
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('recovered-native');

    await expect(resolveSendTargetSessionId(session)).resolves.toBe('recovered-native');
    expect(hoisted.openNativeCliSessionFromSession).toHaveBeenCalledWith(session);
  });

  it('resolves a native session to its recovered send target', async () => {
    const session = createSession('wrapper-1', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        nativeHistorySourceTool: 'claude',
        nativeHistorySourceBackendId: 'backend-1',
      },
    });
    hoisted.getNativeCliSessionTarget.mockReturnValue({
      machineId: 'machine-1',
      tool: 'claude',
      backendId: 'backend-1',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
    });
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('recovered-1');

    await expect(resolveSendTargetSessionId(session)).resolves.toBe('recovered-1');
    expect(hoisted.openNativeCliSessionFromSession).toHaveBeenCalledWith(session);
  });

  it('falls back to the current session id when native recovery returns nothing', async () => {
    const session = createSession('wrapper-2', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        nativeHistorySourceTool: 'claude',
        nativeHistorySourceBackendId: 'backend-2',
      },
    });
    hoisted.getNativeCliSessionTarget.mockReturnValue({
      machineId: 'machine-1',
      tool: 'claude',
      backendId: 'backend-2',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
    });
    hoisted.openNativeCliSessionFromSession.mockResolvedValue(null);

    await expect(resolveSendTargetSessionId(session)).rejects.toThrow(
      'Native CLI session is no longer available on this machine',
    );
  });

  it('rejects native-flavor sessions without a recovered send target', async () => {
    const session = createSession('wrapper-2', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
      },
    });
    hoisted.getNativeCliSessionTarget.mockReturnValue(null);
    hoisted.openNativeCliSessionFromSession.mockResolvedValue(null);

    await expect(resolveSendTargetSessionId(session)).rejects.toThrow(
      'Native CLI session is no longer available on this machine',
    );
  });
});
