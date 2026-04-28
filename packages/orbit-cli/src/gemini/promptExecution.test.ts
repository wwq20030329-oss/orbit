import { describe, expect, it, vi } from 'vitest';

import type { AgentBackend } from '@/agent';

import {
  buildPromptForTurn,
  executeGeminiPromptTurn,
  normalizeGeminiTurnError,
} from './promptExecution';
import type { GeminiThoughtLevelBackend } from './sessionConfigSync';

type ConfigurableGeminiBackend = AgentBackend & GeminiThoughtLevelBackend;

function createBackend(): ConfigurableGeminiBackend {
  return {
    startSession: vi.fn(async () => ({ sessionId: 'session-1' })),
    sendPrompt: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    onMessage: vi.fn(),
    dispose: vi.fn(async () => undefined),
    waitForResponseComplete: vi.fn(async () => undefined),
    setSessionConfigOption: vi.fn(async () => true),
  };
}

describe('buildPromptForTurn', () => {
  it('injects previous conversation context when requested', () => {
    expect(buildPromptForTurn({
      basePrompt: 'Continue',
      injectHistoryContext: true,
      conversationHistory: {
        hasHistory: () => true,
        getContextForNewSession: () => '[HISTORY]\n',
      },
    })).toEqual({
      promptToSend: '[HISTORY]\nContinue',
      injectedHistoryContext: true,
    });
  });

  it('leaves the prompt untouched when history should not be injected', () => {
    expect(buildPromptForTurn({
      basePrompt: 'Continue',
      injectHistoryContext: false,
      conversationHistory: {
        hasHistory: () => true,
        getContextForNewSession: () => '[HISTORY]\n',
      },
    })).toEqual({
      promptToSend: 'Continue',
      injectedHistoryContext: false,
    });
  });
});

describe('executeGeminiPromptTurn', () => {
  it('applies thought level before sending and waits for completion', async () => {
    const backend = createBackend();
    const applyThoughtLevel = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await executeGeminiPromptTurn({
      backend,
      acpSessionId: 'session-1',
      promptToSend: 'hello',
      effortLevel: 'high',
      applyThoughtLevel,
      onRetry,
    });

    expect(applyThoughtLevel).toHaveBeenCalledWith('high', backend);
    expect(backend.sendPrompt).toHaveBeenCalledWith('session-1', 'hello');
    expect(backend.waitForResponseComplete).toHaveBeenCalledWith(120000);
    expect(onRetry).not.toHaveBeenCalled();

    const applyCall = applyThoughtLevel.mock.invocationCallOrder[0];
    const sendCall = (backend.sendPrompt as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(applyCall).toBeLessThan(sendCall);
  });

  it('retries retryable empty-response failures and eventually succeeds', async () => {
    const backend = createBackend();
    let attempt = 0;
    vi.mocked(backend.sendPrompt).mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) {
        throw { data: { details: 'empty response from Gemini' } };
      }
    });

    const applyThoughtLevel = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await executeGeminiPromptTurn({
      backend,
      acpSessionId: 'session-1',
      promptToSend: 'hello',
      effortLevel: undefined,
      applyThoughtLevel,
      onRetry,
      retryDelayMs: 1,
    });

    expect(backend.sendPrompt).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it('does not retry quota failures', async () => {
    const backend = createBackend();
    const quotaError = { data: { details: 'quota exhausted. reset after 1h2m3s' } };
    vi.mocked(backend.sendPrompt).mockRejectedValueOnce(quotaError);

    await expect(executeGeminiPromptTurn({
      backend,
      acpSessionId: 'session-1',
      promptToSend: 'hello',
      effortLevel: undefined,
      applyThoughtLevel: vi.fn(async () => undefined),
      onRetry: vi.fn(),
      retryDelayMs: 1,
    })).rejects.toBe(quotaError);

    expect(backend.sendPrompt).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeGeminiTurnError', () => {
  it('maps known Gemini errors into stable user-facing messages', () => {
    expect(normalizeGeminiTurnError({ code: 404 }, 'gemini-2.5-flash')).toContain('Model "gemini-2.5-flash" not found');
    expect(normalizeGeminiTurnError({ code: 429 })).toContain('rate limit exceeded');
    expect(normalizeGeminiTurnError({ data: { details: 'quota exhausted. reset after 1h2m3s' } })).toContain('Quota resets in 1h2m3s.');
    expect(normalizeGeminiTurnError({ message: 'Authentication required' })).toContain('orbit gemini project set');
    expect(normalizeGeminiTurnError({})).toContain('Is "gemini" CLI installed?');
  });
});
