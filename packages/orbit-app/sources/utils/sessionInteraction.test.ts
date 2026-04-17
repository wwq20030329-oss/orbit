import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
  isSessionOpenedAsHistoryOnly: vi.fn(),
  shouldAutoResolveNativeCliSession: vi.fn(),
}));

vi.mock('./openNativeCliSession', () => ({
  isSessionOpenedAsHistoryOnly: hoisted.isSessionOpenedAsHistoryOnly,
}));

vi.mock('./nativeCliSessionResolver', () => ({
  shouldAutoResolveNativeCliSession: hoisted.shouldAutoResolveNativeCliSession,
}));

import { isSessionInteractionBlocked } from './sessionInteraction';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    seq: 1,
    createdAt: 1,
    updatedAt: Date.now(),
    active: true,
    activeAt: Date.now(),
    metadata: {
      machineId: 'machine-1',
      path: '/Users/test/project',
      host: 'wwq-mac',
      flavor: 'codex',
      codexThreadId: 'thread-1',
      lifecycleState: 'running',
      ...overrides.metadata,
    },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence: 'online',
    ...overrides,
  };
}

describe('isSessionInteractionBlocked', () => {
  beforeEach(() => {
    hoisted.isSessionOpenedAsHistoryOnly.mockReset();
    hoisted.shouldAutoResolveNativeCliSession.mockReset();
    hoisted.isSessionOpenedAsHistoryOnly.mockReturnValue(false);
    hoisted.shouldAutoResolveNativeCliSession.mockReturnValue(false);
  });

  it('treats history-only opened sessions as blocked', () => {
    const session = createSession();
    hoisted.isSessionOpenedAsHistoryOnly.mockReturnValue(true);

    expect(isSessionInteractionBlocked(session, { sessionId: session.id })).toBe(true);
  });

  it('treats unresolved native sessions as blocked', () => {
    const session = createSession();
    hoisted.shouldAutoResolveNativeCliSession.mockReturnValue(true);

    expect(isSessionInteractionBlocked(session, { sessionId: session.id })).toBe(true);
  });

  it('allows normal live sessions through', () => {
    const session = createSession();

    expect(isSessionInteractionBlocked(session, { sessionId: session.id })).toBe(false);
  });
});
