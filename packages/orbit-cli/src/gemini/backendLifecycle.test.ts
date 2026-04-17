import { describe, expect, it, vi } from 'vitest';

import type { AgentBackend } from '@/agent';

import { ensureGeminiBackendSession, type GeminiBackendLifecycleState } from './backendLifecycle';
import type { GeminiMode } from './types';

function createBackendMock(sessionId: string): AgentBackend {
  return {
    startSession: vi.fn(async () => ({ sessionId })),
    sendPrompt: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    onMessage: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
}

function createState(overrides: Partial<GeminiBackendLifecycleState> = {}): GeminiBackendLifecycleState {
  return {
    backend: null,
    acpSessionId: null,
    currentModeHash: null,
    pendingResumeSessionId: 'resume-123',
    first: true,
    wasSessionCreated: false,
    ...overrides,
  };
}

function createMode(overrides: Partial<GeminiMode> = {}): GeminiMode {
  return {
    permissionMode: 'default',
    model: 'gemini-2.5-pro',
    effortLevel: 'medium',
    ...overrides,
  };
}

function createConversationHistory(options: { hasHistory?: boolean; size?: number } = {}) {
  return {
    hasHistory: vi.fn(() => options.hasHistory ?? false),
    size: vi.fn(() => options.size ?? 0),
    getSummary: vi.fn(() => '2 messages'),
    setCurrentModel: vi.fn(),
  };
}

describe('ensureGeminiBackendSession', () => {
  it('creates and starts a backend for the first Gemini turn', async () => {
    const backend = createBackendMock('session-1');
    const history = createConversationHistory();
    const deps = {
      createBackend: vi.fn(() => ({
        backend,
        model: 'gemini-2.5-pro',
        modelSource: 'explicit' as const,
      })),
      setupBackend: vi.fn(),
      updateDisplayedModel: vi.fn(),
      applyPermissionMode: vi.fn(),
      applyThoughtLevel: vi.fn(async () => undefined),
      notifyModeChange: vi.fn(),
      resetModeChangeState: vi.fn(),
    };

    const result = await ensureGeminiBackendSession({
      state: createState(),
      turn: { hash: 'mode-a', mode: createMode() },
      conversationHistory: history,
      deps,
    });

    expect(deps.createBackend).toHaveBeenCalledWith('gemini-2.5-pro', 'resume-123');
    expect(deps.setupBackend).toHaveBeenCalledWith(backend);
    expect(deps.updateDisplayedModel).toHaveBeenCalledWith('gemini-2.5-pro', false);
    expect(deps.applyPermissionMode).toHaveBeenCalledWith('default');
    expect(deps.applyThoughtLevel).toHaveBeenCalledWith('medium', backend);
    expect(result.injectHistoryContext).toBe(false);
    expect(result.state).toMatchObject({
      backend,
      acpSessionId: 'session-1',
      currentModeHash: 'mode-a',
      pendingResumeSessionId: undefined,
      first: true,
      wasSessionCreated: true,
    });

    const startSessionCall = (backend.startSession as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const permissionCall = deps.applyPermissionMode.mock.invocationCallOrder[0];
    expect(permissionCall).toBeLessThan(startSessionCall);
  });

  it('reuses the active backend when mode has not changed', async () => {
    const backend = createBackendMock('session-existing');
    const history = createConversationHistory({ hasHistory: true, size: 4 });
    const deps = {
      createBackend: vi.fn(),
      setupBackend: vi.fn(),
      updateDisplayedModel: vi.fn(),
      applyPermissionMode: vi.fn(),
      applyThoughtLevel: vi.fn(async () => undefined),
      notifyModeChange: vi.fn(),
      resetModeChangeState: vi.fn(),
    };

    const initialState = createState({
      backend,
      acpSessionId: 'session-existing',
      currentModeHash: 'mode-a',
      pendingResumeSessionId: undefined,
      first: false,
      wasSessionCreated: true,
    });

    const result = await ensureGeminiBackendSession({
      state: initialState,
      turn: { hash: 'mode-a', mode: createMode() },
      conversationHistory: history,
      deps,
    });

    expect(result.injectHistoryContext).toBe(false);
    expect(result.state).toEqual(initialState);
    expect(deps.createBackend).not.toHaveBeenCalled();
    expect(deps.notifyModeChange).not.toHaveBeenCalled();
  });

  it('restarts the backend on mode changes and preserves history context', async () => {
    const oldBackend = createBackendMock('session-old');
    const newBackend = createBackendMock('session-new');
    const history = createConversationHistory({ hasHistory: true, size: 2 });
    const deps = {
      createBackend: vi.fn(() => ({
        backend: newBackend,
        model: 'gemini-2.5-flash',
        modelSource: 'explicit' as const,
      })),
      setupBackend: vi.fn(),
      updateDisplayedModel: vi.fn(),
      applyPermissionMode: vi.fn(),
      applyThoughtLevel: vi.fn(async () => undefined),
      notifyModeChange: vi.fn(),
      resetModeChangeState: vi.fn(),
    };

    const result = await ensureGeminiBackendSession({
      state: createState({
        backend: oldBackend,
        acpSessionId: 'session-old',
        currentModeHash: 'mode-a',
        pendingResumeSessionId: 'resume-123',
        first: false,
        wasSessionCreated: true,
      }),
      turn: {
        hash: 'mode-b',
        mode: createMode({ model: 'gemini-2.5-flash', permissionMode: 'read-only', effortLevel: 'high' }),
      },
      conversationHistory: history,
      deps,
    });

    expect(oldBackend.dispose).toHaveBeenCalledOnce();
    expect(deps.notifyModeChange).toHaveBeenCalledWith({
      injectHistoryContext: true,
      preservedMessages: 2,
      historySummary: '2 messages',
    });
    expect(deps.resetModeChangeState).toHaveBeenCalledOnce();
    expect(deps.createBackend).toHaveBeenCalledWith('gemini-2.5-flash', 'resume-123');
    expect(deps.setupBackend).toHaveBeenCalledWith(newBackend);
    expect(history.setCurrentModel).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(deps.applyPermissionMode).toHaveBeenCalledWith('read-only');
    expect(deps.applyThoughtLevel).toHaveBeenCalledWith('high', newBackend);
    expect(result.injectHistoryContext).toBe(true);
    expect(result.state).toMatchObject({
      backend: newBackend,
      acpSessionId: 'session-new',
      currentModeHash: 'mode-b',
      pendingResumeSessionId: undefined,
      first: false,
      wasSessionCreated: true,
    });

    const startSessionCall = (newBackend.startSession as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const updateDisplayedModelCall = deps.updateDisplayedModel.mock.invocationCallOrder[0];
    expect(startSessionCall).toBeLessThan(updateDisplayedModelCall);
  });
});
