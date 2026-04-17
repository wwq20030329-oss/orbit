import type { AgentBackend } from '@/agent';
import { logger } from '@/ui/logger';

import { DEFAULT_GEMINI_MODEL } from './constants';
import type { GeminiThoughtLevelBackend } from './sessionConfigSync';

type ConfigurableGeminiBackend = AgentBackend & GeminiThoughtLevelBackend;

export interface GeminiConversationContextLike {
  hasHistory(): boolean;
  getContextForNewSession(): string;
}

type GeminiPromptErrorInfo = {
  code: number | string | undefined;
  details: string;
  message: string;
  errorString: string;
};

function extractGeminiPromptErrorInfo(error: unknown): GeminiPromptErrorInfo {
  if (!error || typeof error !== 'object') {
    return {
      code: undefined,
      details: '',
      message: error instanceof Error ? error.message : String(error ?? ''),
      errorString: String(error ?? ''),
    };
  }

  const errObj = error as any;
  return {
    code: errObj.code ?? errObj.status ?? errObj.response?.status,
    details: errObj.data?.details ?? errObj.details ?? '',
    message: errObj.message ?? errObj.error?.message ?? '',
    errorString: String(error),
  };
}

function getQuotaResetTimeSuffix(parts: string): string {
  const match = parts.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
  if (!match) {
    return '';
  }

  const duration = match.slice(1).filter(Boolean).join('');
  return duration ? ` Quota resets in ${duration}.` : '';
}

function isQuotaError(info: GeminiPromptErrorInfo): boolean {
  return info.details.includes('exhausted')
    || info.details.includes('quota')
    || info.details.includes('capacity')
    || info.message.includes('quota')
    || info.errorString.includes('quota');
}

function isRetryablePromptError(info: GeminiPromptErrorInfo): boolean {
  const isEmptyResponseError = info.details.includes('empty response')
    || info.details.includes('Model stream ended');
  const isInternalError = info.code === -32603;
  return isEmptyResponseError || isInternalError;
}

export function buildPromptForTurn(args: {
  basePrompt: string;
  injectHistoryContext: boolean;
  conversationHistory: GeminiConversationContextLike;
}): {
  promptToSend: string;
  injectedHistoryContext: boolean;
} {
  const { basePrompt, injectHistoryContext, conversationHistory } = args;

  if (!injectHistoryContext || !conversationHistory.hasHistory()) {
    return {
      promptToSend: basePrompt,
      injectedHistoryContext: false,
    };
  }

  const historyContext = conversationHistory.getContextForNewSession();
  const promptToSend = historyContext + basePrompt;
  logger.debug(`[gemini] Injected conversation history context (${historyContext.length} chars)`);

  return {
    promptToSend,
    injectedHistoryContext: true,
  };
}

export async function executeGeminiPromptTurn(args: {
  backend: ConfigurableGeminiBackend;
  acpSessionId: string;
  promptToSend: string;
  effortLevel: string | undefined;
  applyThoughtLevel: (
    requestedThoughtLevel: string | undefined,
    backend: ConfigurableGeminiBackend | null,
  ) => Promise<void>;
  onRetry: (attempt: number, maxRetries: number) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  responseTimeoutMs?: number;
}): Promise<void> {
  const {
    backend,
    acpSessionId,
    promptToSend,
    effortLevel,
    applyThoughtLevel,
    onRetry,
    maxRetries = 3,
    retryDelayMs = 2000,
    responseTimeoutMs = 120000,
  } = args;

  logger.debug(`[gemini] Sending prompt to Gemini (length: ${promptToSend.length}): ${promptToSend.substring(0, 100)}...`);
  logger.debug(`[gemini] Full prompt: ${promptToSend}`);
  await applyThoughtLevel(effortLevel, backend);

  let hadRetry = false;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await backend.sendPrompt(acpSessionId, promptToSend);
      logger.debug('[gemini] Prompt sent successfully');

      if (backend.waitForResponseComplete) {
        await backend.waitForResponseComplete(responseTimeoutMs);
        logger.debug('[gemini] Response complete');
      }

      if (hadRetry) {
        logger.debug('[gemini] Prompt succeeded after retries');
      }
      return;
    } catch (error) {
      const errorInfo = extractGeminiPromptErrorInfo(error);
      if (!isRetryablePromptError(errorInfo) || isQuotaError(errorInfo) || attempt >= maxRetries) {
        throw error;
      }

      hadRetry = true;
      logger.debug(`[gemini] Retryable error on attempt ${attempt}/${maxRetries}: ${errorInfo.details}`);
      onRetry(attempt, maxRetries);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}

export function normalizeGeminiTurnError(error: unknown, currentModel: string = DEFAULT_GEMINI_MODEL): string {
  const info = extractGeminiPromptErrorInfo(error);

  if (error instanceof Error && error.name === 'AbortError') {
    return 'Aborted by user';
  }

  if (info.code === 404
    || info.details.includes('notFound')
    || info.details.includes('404')
    || info.message.includes('not found')
    || info.message.includes('404')) {
    return `Model "${currentModel}" not found. Available models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite`;
  }

  if (info.code === -32603
    || info.details.includes('empty response')
    || info.details.includes('Model stream ended')) {
    return 'Gemini API returned empty response after retries. This is a temporary issue - please try again.';
  }

  if (info.code === 429
    || info.details.includes('429')
    || info.message.includes('429')
    || info.errorString.includes('429')
    || info.details.includes('rateLimitExceeded')
    || info.details.includes('RESOURCE_EXHAUSTED')
    || info.message.includes('Rate limit exceeded')
    || info.message.includes('Resource exhausted')
    || info.errorString.includes('rateLimitExceeded')
    || info.errorString.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini API rate limit exceeded. Please wait a moment and try again. The API will retry automatically.';
  }

  if (isQuotaError(info)) {
    const resetTimeSuffix = getQuotaResetTimeSuffix(info.details + info.message + info.errorString);
    return `Gemini quota exceeded.${resetTimeSuffix} Try using a different model (gemini-2.5-flash-lite) or wait for quota reset.`;
  }

  if (info.message.includes('Authentication required')
    || info.details.includes('Authentication required')
    || info.code === -32000) {
    return `Authentication required. For Google Workspace accounts, you need to set a Google Cloud Project:\n`
      + `  orbit gemini project set <your-project-id>\n`
      + `Or use a different Google account: orbit connect gemini\n`
      + `Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca`;
  }

  if (error && typeof error === 'object' && Object.keys(error as Record<string, unknown>).length === 0) {
    return 'Failed to start Gemini. Is "gemini" CLI installed? Run: npm install -g @google/gemini-cli';
  }

  if (info.details || info.message) {
    return info.details || info.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Process error occurred';
}
