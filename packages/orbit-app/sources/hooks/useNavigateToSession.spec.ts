import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => {
  const state = {
    sessions: {} as Record<string, Session>,
    sessionMessages: {} as Record<string, { messages?: Array<{ kind: string }> }>,
    applyLocalSettings: vi.fn(),
    setPhoneWorkspaceSessionId: vi.fn(),
  };

  return {
    state,
    trackSessionSwitched: vi.fn(),
    clearSessionOpenedAsHistoryOnly: vi.fn(),
    openNativeCliSessionFromSession: vi.fn(),
    openNativeCliSessionFromIdentifier: vi.fn(),
    refreshSessions: vi.fn(),
    waitForSessionReady: vi.fn(),
    rememberNativeCliHintsForSession: vi.fn(),
    isNativeCliResumeUnavailableError: vi.fn(),
    isNativeCliSessionMissingError: vi.fn(),
    getNativeCliSessionTarget: vi.fn(),
    shouldAutoResolveNativeCliSession: vi.fn(),
    hasMeaningfulSessionHistoryMessages: vi.fn(),
    getDeviceType: vi.fn(),
  };
});

vi.mock('@/sync/storage', () => ({
  storage: {
    getState: () => hoisted.state,
  },
}));

vi.mock('@/track', () => ({
  trackSessionSwitched: hoisted.trackSessionSwitched,
}));

vi.mock('@/utils/openNativeCliSession', () => ({
  clearSessionOpenedAsHistoryOnly: hoisted.clearSessionOpenedAsHistoryOnly,
  openNativeCliSessionFromSession: hoisted.openNativeCliSessionFromSession,
  openNativeCliSessionFromIdentifier: hoisted.openNativeCliSessionFromIdentifier,
  rememberNativeCliHintsForSession: hoisted.rememberNativeCliHintsForSession,
  isNativeCliResumeUnavailableError: hoisted.isNativeCliResumeUnavailableError,
  isNativeCliSessionMissingError: hoisted.isNativeCliSessionMissingError,
}));

vi.mock('@/sync/sync', () => ({
  sync: {
    refreshSessions: hoisted.refreshSessions,
    waitForSessionReady: hoisted.waitForSessionReady,
  },
}));

vi.mock('@/utils/nativeCliHistory', () => ({
  hasMeaningfulSessionHistoryMessages: hoisted.hasMeaningfulSessionHistoryMessages,
}));

vi.mock('@/utils/nativeCliSessionResolver', () => ({
  getNativeCliSessionTarget: hoisted.getNativeCliSessionTarget,
  shouldAutoResolveNativeCliSession: hoisted.shouldAutoResolveNativeCliSession,
}));

vi.mock('@/utils/responsive', () => ({
  getDeviceType: hoisted.getDeviceType,
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

vi.mock('expo-router', () => ({
  useRouter: vi.fn(),
}));

import { navigateToSession } from './useNavigateToSession';

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
      codexThreadId: 'thread-1',
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

describe('navigateToSession', () => {
  beforeEach(() => {
    hoisted.state.sessions = {
      'session-1': createSession(),
    };
    hoisted.state.sessionMessages = {};
    hoisted.state.applyLocalSettings.mockReset();
    hoisted.state.setPhoneWorkspaceSessionId.mockReset();
    hoisted.trackSessionSwitched.mockReset();
    hoisted.clearSessionOpenedAsHistoryOnly.mockReset();
    hoisted.openNativeCliSessionFromSession.mockReset();
    hoisted.openNativeCliSessionFromIdentifier.mockReset();
    hoisted.refreshSessions.mockReset();
    hoisted.waitForSessionReady.mockReset();
    hoisted.rememberNativeCliHintsForSession.mockReset();
    hoisted.isNativeCliResumeUnavailableError.mockReset();
    hoisted.isNativeCliSessionMissingError.mockReset();
    hoisted.getNativeCliSessionTarget.mockReset();
    hoisted.shouldAutoResolveNativeCliSession.mockReset();
    hoisted.hasMeaningfulSessionHistoryMessages.mockReset();

    hoisted.getNativeCliSessionTarget.mockReturnValue({
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
    });
    hoisted.shouldAutoResolveNativeCliSession.mockReturnValue(true);
    hoisted.hasMeaningfulSessionHistoryMessages.mockImplementation((messages: Array<{ kind: string }> | undefined) => (
      Array.isArray(messages) && messages.some((message) => (
        message.kind === 'user-text' || message.kind === 'agent-text' || message.kind === 'tool-call'
      ))
    ));
    hoisted.getDeviceType.mockReturnValue('tablet');
    hoisted.isNativeCliResumeUnavailableError.mockReturnValue(false);
    hoisted.isNativeCliSessionMissingError.mockReturnValue(false);
    hoisted.waitForSessionReady.mockResolvedValue(true);
  });

  it('waits for native session recovery before navigating', async () => {
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-1');
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.clearSessionOpenedAsHistoryOnly).toHaveBeenCalledWith('session-1');
    expect(hoisted.rememberNativeCliHintsForSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-1',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens actual sessions inside the phone workspace on phones', async () => {
    hoisted.getDeviceType.mockReturnValue('phone');
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-1');
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith('session-1');
    expect(router.navigate).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the resolved native session inside the phone workspace when recovery reroutes to a different session', async () => {
    hoisted.getDeviceType.mockReturnValue('phone');
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.state.sessions['session-2'] = createSession({
      id: 'session-2',
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
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.state.setPhoneWorkspaceSessionId).toHaveBeenCalledWith('session-2');
    expect(router.navigate).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('still resolves native-flavor sessions before navigating even without an attached backend id', async () => {
    hoisted.state.sessions = {
      'session-1': createSession({
        metadata: {
          machineId: 'machine-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'claude',
        },
      }),
    };
    hoisted.getNativeCliSessionTarget.mockReturnValue(null);
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.state.sessions['session-2'] = createSession({
      id: 'session-2',
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-1',
        claudeSessionId: 'claude-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'claude',
        lifecycleState: 'running',
      },
    });
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.clearSessionOpenedAsHistoryOnly).toHaveBeenCalledWith('session-1');
    expect(hoisted.openNativeCliSessionFromSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-2',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
  });

  it('navigates directly to the resolved native session when it changes', async () => {
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.state.sessions['session-2'] = createSession({
      id: 'session-2',
      active: true,
      activeAt: Date.now(),
      presence: 'online',
    });
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.clearSessionOpenedAsHistoryOnly).toHaveBeenCalledWith('session-1');
    expect(hoisted.rememberNativeCliHintsForSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-2',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('still resolves native sessions before navigating even when cached history is already available', async () => {
    hoisted.state.sessionMessages['session-1'] = {
      messages: [{ kind: 'user-text' }],
    };
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.state.sessions['session-2'] = createSession({
      id: 'session-2',
      active: true,
      activeAt: Date.now(),
      presence: 'online',
    });
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.clearSessionOpenedAsHistoryOnly).toHaveBeenCalledWith('session-1');
    expect(hoisted.rememberNativeCliHintsForSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(hoisted.openNativeCliSessionFromSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-2',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('waits for the resolved session id to become locally ready before navigating to it', async () => {
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.waitForSessionReady.mockImplementation(async () => {
      hoisted.state.sessions['session-2'] = createSession({
        id: 'session-2',
        active: true,
        activeAt: Date.now(),
        presence: 'online',
      });
      return true;
    });
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.clearSessionOpenedAsHistoryOnly).toHaveBeenCalledWith('session-1');
    expect(hoisted.waitForSessionReady).toHaveBeenCalledWith('session-2', expect.objectContaining({
      allowFallbackRefresh: true,
    }));
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-2',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
  });

  it('still prefers native cli recovery for archived native sessions', async () => {
    hoisted.state.sessions = {
      'session-1': createSession({
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'archived',
        },
      }),
    };
    hoisted.openNativeCliSessionFromSession.mockResolvedValue('session-2');
    hoisted.state.sessions['session-2'] = createSession({
      id: 'session-2',
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
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1');

    expect(hoisted.openNativeCliSessionFromSession).toHaveBeenCalledWith(hoisted.state.sessions['session-1']);
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-2',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
  });

  it('can preserve an archived native session when the caller is explicitly opening history', async () => {
    hoisted.state.sessions = {
      'session-1': createSession({
        metadata: {
          machineId: 'machine-1',
          codexThreadId: 'thread-1',
          path: '/Users/test/project',
          host: 'wwq-mac',
          flavor: 'codex',
          lifecycleState: 'archived',
        },
      }),
    };
    const router = {
      navigate: vi.fn(),
      replace: vi.fn(),
    };

    await navigateToSession(router as never, 'session-1', {
      preferHistoryEntry: true,
    });

    expect(hoisted.openNativeCliSessionFromSession).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(
      '/session/session-1?history=1',
      expect.objectContaining({
        dangerouslySingular: expect.any(Function),
      }),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
