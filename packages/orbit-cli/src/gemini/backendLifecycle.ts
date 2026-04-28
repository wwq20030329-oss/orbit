import type { PermissionMode } from '@/api/types';
import type { AgentBackend } from '@/agent';
import type { GeminiBackendResult } from '@/agent/factories/gemini';
import { logger } from '@/ui/logger';

import type { GeminiThoughtLevelBackend } from './sessionConfigSync';
import type { GeminiMode } from './types';

type ConfigurableGeminiBackend = AgentBackend & GeminiThoughtLevelBackend;

export interface GeminiBackendLifecycleState {
  backend: AgentBackend | null;
  acpSessionId: string | null;
  currentModeHash: string | null;
  pendingResumeSessionId?: string;
  first: boolean;
  wasSessionCreated: boolean;
}

export interface GeminiConversationHistoryLike {
  hasHistory(): boolean;
  size(): number;
  getSummary(): string;
  setCurrentModel(model: string | undefined): void;
}

export interface GeminiBackendLifecycleDeps {
  createBackend: (model: string | null | undefined, resumeSessionId: string | undefined) => GeminiBackendResult;
  setupBackend: (backend: AgentBackend) => void;
  updateDisplayedModel: (model: string, saveToConfig: boolean) => void;
  applyPermissionMode: (mode: PermissionMode) => void;
  applyThoughtLevel: (
    requestedThoughtLevel: string | undefined,
    backend: ConfigurableGeminiBackend | null,
  ) => Promise<void>;
  notifyModeChange: (args: {
    injectHistoryContext: boolean;
    preservedMessages: number;
    historySummary: string | null;
  }) => void;
  resetModeChangeState: () => void;
}

function resolveModelOverride(mode: GeminiMode): string | null | undefined {
  return mode.model === undefined ? undefined : (mode.model || null);
}

export async function ensureGeminiBackendSession(args: {
  state: GeminiBackendLifecycleState;
  turn: {
    hash: string;
    mode: GeminiMode;
  };
  conversationHistory: GeminiConversationHistoryLike;
  deps: GeminiBackendLifecycleDeps;
}): Promise<{
  state: GeminiBackendLifecycleState;
  injectHistoryContext: boolean;
}> {
  const { turn, conversationHistory, deps } = args;
  const nextState: GeminiBackendLifecycleState = {
    ...args.state,
  };
  const modelToUse = resolveModelOverride(turn.mode);
  const modeChanged = Boolean(nextState.wasSessionCreated && nextState.currentModeHash && turn.hash !== nextState.currentModeHash);

  if (modeChanged) {
    logger.debug('[Gemini] Mode changed – restarting Gemini session');

    const injectHistoryContext = conversationHistory.hasHistory();
    deps.notifyModeChange({
      injectHistoryContext,
      preservedMessages: injectHistoryContext ? conversationHistory.size() : 0,
      historySummary: injectHistoryContext ? conversationHistory.getSummary() : null,
    });

    deps.resetModeChangeState();

    if (nextState.backend) {
      await nextState.backend.dispose();
      nextState.backend = null;
    }

    const backendResult = deps.createBackend(modelToUse, nextState.pendingResumeSessionId);
    nextState.backend = backendResult.backend;
    deps.setupBackend(nextState.backend);

    logger.debug(
      `[gemini] Model change - modelToUse=${modelToUse}, actualModel=${backendResult.model} (from ${backendResult.modelSource})`,
    );

    conversationHistory.setCurrentModel(backendResult.model);

    logger.debug('[gemini] Starting new ACP session with model:', backendResult.model);
    const { sessionId } = await nextState.backend.startSession();
    nextState.acpSessionId = sessionId;
    nextState.pendingResumeSessionId = undefined;
    logger.debug(`[gemini] New ACP session started: ${nextState.acpSessionId}`);

    logger.debug(`[gemini] Calling updateDisplayedModel with: ${backendResult.model}`);
    deps.updateDisplayedModel(backendResult.model, false);
    deps.applyPermissionMode(turn.mode.permissionMode);
    await deps.applyThoughtLevel(turn.mode.effortLevel, nextState.backend as ConfigurableGeminiBackend);

    nextState.wasSessionCreated = true;
    nextState.currentModeHash = turn.hash;
    nextState.first = false;

    return {
      state: nextState,
      injectHistoryContext,
    };
  }

  if (nextState.first || !nextState.wasSessionCreated) {
    if (!nextState.backend) {
      const backendResult = deps.createBackend(modelToUse, nextState.pendingResumeSessionId);
      nextState.backend = backendResult.backend;
      deps.setupBackend(nextState.backend);

      logger.debug(`[gemini] Backend created, model will be: ${backendResult.model} (from ${backendResult.modelSource})`);
      logger.debug(`[gemini] Calling updateDisplayedModel with: ${backendResult.model}`);
      deps.updateDisplayedModel(backendResult.model, false);

      conversationHistory.setCurrentModel(backendResult.model);
    }

    if (!nextState.acpSessionId) {
      logger.debug('[gemini] Starting ACP session...');
      deps.applyPermissionMode(turn.mode.permissionMode);

      const { sessionId } = await nextState.backend.startSession();
      nextState.acpSessionId = sessionId;
      nextState.pendingResumeSessionId = undefined;
      logger.debug(`[gemini] ACP session started: ${nextState.acpSessionId}`);

      await deps.applyThoughtLevel(turn.mode.effortLevel, nextState.backend as ConfigurableGeminiBackend);
      nextState.wasSessionCreated = true;
      nextState.currentModeHash = turn.hash;
    }
  }

  return {
    state: nextState,
    injectHistoryContext: false,
  };
}
