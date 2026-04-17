import type { Metadata } from '@/api/types';
import {
  extractConfigOptionsFromPayload,
  extractCurrentModeIdFromPayload,
  extractModelStateFromPayload,
  extractModeStateFromPayload,
  mergeAcpSessionConfigIntoMetadata,
} from '@/agent/acp/sessionConfigMetadata';
import { logger } from '@/ui/logger';

import {
  extractGeminiConfigSelector,
  resolveGeminiRequestedCode,
  type GeminiConfigSelector,
} from './configSelectors';

export interface GeminiSessionMetadataTarget {
  updateMetadata: (updater: (metadata: Metadata) => Metadata) => void;
}

export interface GeminiThoughtLevelBackend {
  setSessionConfigOption?: (configId: string, value: string) => Promise<boolean>;
}

export function applyGeminiSessionConfigEvent(args: {
  name: string;
  payload: unknown;
  session: GeminiSessionMetadataTarget;
  thoughtLevelSelector: GeminiConfigSelector | null;
}): {
  handled: boolean;
  thoughtLevelSelector: GeminiConfigSelector | null;
} {
  const { name, payload, session, thoughtLevelSelector } = args;

  if (name === 'config_options_update') {
    const configOptions = extractConfigOptionsFromPayload(payload);
    if (!configOptions) {
      return { handled: true, thoughtLevelSelector };
    }

    session.updateMetadata((currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, {
      configOptions,
    }));

    return {
      handled: true,
      thoughtLevelSelector: extractGeminiConfigSelector(configOptions, 'thought_level'),
    };
  }

  if (name === 'modes_update') {
    const modes = extractModeStateFromPayload(payload);
    if (modes) {
      session.updateMetadata((currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { modes }));
    }
    return { handled: true, thoughtLevelSelector };
  }

  if (name === 'models_update') {
    const models = extractModelStateFromPayload(payload);
    if (models) {
      session.updateMetadata((currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { models }));
    }
    return { handled: true, thoughtLevelSelector };
  }

  if (name === 'current_mode_update') {
    const currentModeId = extractCurrentModeIdFromPayload(payload);
    if (currentModeId) {
      session.updateMetadata((currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { currentModeId }));
    }
    return { handled: true, thoughtLevelSelector };
  }

  return { handled: false, thoughtLevelSelector };
}

export async function switchGeminiThoughtLevelIfRequested(args: {
  requestedThoughtLevel: string | undefined;
  thoughtLevelSelector: GeminiConfigSelector | null;
  backend: GeminiThoughtLevelBackend | null | undefined;
}): Promise<{
  thoughtLevelSelector: GeminiConfigSelector | null;
  currentEffortLevel?: string;
}> {
  const { requestedThoughtLevel, thoughtLevelSelector, backend } = args;
  if (!requestedThoughtLevel || !thoughtLevelSelector || !backend) {
    return { thoughtLevelSelector };
  }

  const resolved = resolveGeminiRequestedCode(thoughtLevelSelector.options, requestedThoughtLevel);
  if (!resolved) {
    logger.debug(`[Gemini] Ignoring unknown thought level request: ${requestedThoughtLevel}`);
    return { thoughtLevelSelector };
  }

  if (resolved === thoughtLevelSelector.currentCode) {
    return { thoughtLevelSelector };
  }

  if (!backend.setSessionConfigOption) {
    logger.debug('[Gemini] Backend does not expose setSessionConfigOption; skipping thought level switch');
    return { thoughtLevelSelector };
  }

  const switched = await backend.setSessionConfigOption(thoughtLevelSelector.configId, resolved);
  if (!switched) {
    return { thoughtLevelSelector };
  }

  return {
    thoughtLevelSelector: {
      ...thoughtLevelSelector,
      currentCode: resolved,
    },
    currentEffortLevel: resolved,
  };
}
