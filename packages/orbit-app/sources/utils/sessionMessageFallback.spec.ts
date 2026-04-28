import { describe, expect, it } from 'vitest';

import type { Session } from '@/sync/storageTypes';
import type { Message } from '@/sync/typesMessage';
import { findFallbackSessionMessages } from './sessionMessageFallback';

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
      codexThreadId: 'thread-1',
      path: '/Users/test/project',
      host: 'wwq-mac',
      flavor: 'codex',
      lifecycleState: 'running',
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

function createMessage(id: string): Message {
  return {
    id,
    localId: id,
    role: 'agent',
    kind: 'agent-text',
    text: `message:${id}`,
    createdAt: 1,
    seq: 1,
  } as Message;
}

describe('findFallbackSessionMessages', () => {
  it('reuses loaded messages from a matching wrapper session', () => {
    const currentSession = createSession('current', {
      updatedAt: 10,
      presence: 'online',
    });
    const wrapperSession = createSession('wrapper', {
      updatedAt: 9,
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-1',
      },
    });

    const messages = [createMessage('m1')];
    const result = findFallbackSessionMessages({
      currentSession,
      currentSessionId: 'current',
      sessions: {
        current: currentSession,
        wrapper: wrapperSession,
      },
      sessionMessages: {
        wrapper: {
          messages,
          isLoaded: true,
        },
      },
    });

    expect(result).toEqual(messages);
  });

  it('ignores matching sessions whose messages are not loaded yet', () => {
    const currentSession = createSession('current');
    const wrapperSession = createSession('wrapper', {
      metadata: {
        machineId: 'machine-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-1',
      },
    });

    const result = findFallbackSessionMessages({
      currentSession,
      currentSessionId: 'current',
      sessions: {
        current: currentSession,
        wrapper: wrapperSession,
      },
      sessionMessages: {
        wrapper: {
          messages: [createMessage('m1')],
          isLoaded: false,
        },
      },
    });

    expect(result).toEqual([]);
  });

  it('prefers the best-matching session when multiple cached candidates exist', () => {
    const currentSession = createSession('current', {
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'running',
      },
    });
    const samePathWrapper = createSession('same-path', {
      updatedAt: 5,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
      },
    });
    const otherMachineWrapper = createSession('other-machine', {
      updatedAt: 99,
      metadata: {
        machineId: 'machine-2',
        codexThreadId: 'thread-1',
        path: '/Users/test/project',
        host: 'other-mac',
        flavor: 'codex',
        lifecycleState: 'idle',
      },
    });

    const result = findFallbackSessionMessages({
      currentSession,
      currentSessionId: 'current',
      sessions: {
        current: currentSession,
        'same-path': samePathWrapper,
        'other-machine': otherMachineWrapper,
      },
      sessionMessages: {
        'same-path': {
          messages: [createMessage('same-path')],
          isLoaded: true,
        },
        'other-machine': {
          messages: [createMessage('other-machine')],
          isLoaded: true,
        },
      },
    });

    expect(result).toEqual([createMessage('same-path')]);
  });
});
