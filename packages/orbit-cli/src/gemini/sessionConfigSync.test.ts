import { describe, expect, it, vi } from 'vitest';

import { applyGeminiSessionConfigEvent, switchGeminiThoughtLevelIfRequested } from './sessionConfigSync';

describe('applyGeminiSessionConfigEvent', () => {
  it('updates metadata and thought-level selector from config options updates', () => {
    let metadata: Record<string, unknown> = {};
    const session = {
      updateMetadata: (updater: (current: any) => any) => {
        metadata = updater(metadata);
      },
    };

    const result = applyGeminiSessionConfigEvent({
      name: 'config_options_update',
      payload: [
        {
          id: 'thought-level',
          name: 'Thought level',
          type: 'select',
          category: 'thought_level',
          currentValue: 'medium',
          options: [
            { value: 'low', name: 'Low' },
            { value: 'medium', name: 'Medium' },
          ],
        },
      ],
      session,
      thoughtLevelSelector: null,
    });

    expect(result.handled).toBe(true);
    expect(result.thoughtLevelSelector).toMatchObject({
      configId: 'thought-level',
      currentCode: 'medium',
    });
    expect(metadata).toMatchObject({
      thoughtLevels: [
        { code: 'low', value: 'Low' },
        { code: 'medium', value: 'Medium' },
      ],
      currentThoughtLevelCode: 'medium',
    });
  });

  it('returns unhandled for unrelated events', () => {
    const result = applyGeminiSessionConfigEvent({
      name: 'other_event',
      payload: {},
      session: {
        updateMetadata: () => undefined,
      },
      thoughtLevelSelector: null,
    });

    expect(result).toEqual({
      handled: false,
      thoughtLevelSelector: null,
    });
  });
});

describe('switchGeminiThoughtLevelIfRequested', () => {
  it('switches supported thought levels through the backend', async () => {
    const setSessionConfigOption = vi.fn(async () => true);

    const result = await switchGeminiThoughtLevelIfRequested({
      requestedThoughtLevel: 'high',
      thoughtLevelSelector: {
        configId: 'thought-level',
        currentCode: 'medium',
        options: [
          { code: 'medium', value: 'Medium' },
          { code: 'high', value: 'High' },
        ],
      },
      backend: { setSessionConfigOption },
    });

    expect(setSessionConfigOption).toHaveBeenCalledWith('thought-level', 'high');
    expect(result).toEqual({
      thoughtLevelSelector: {
        configId: 'thought-level',
        currentCode: 'high',
        options: [
          { code: 'medium', value: 'Medium' },
          { code: 'high', value: 'High' },
        ],
      },
      currentEffortLevel: 'high',
    });
  });

  it('ignores unknown thought levels without calling the backend', async () => {
    const setSessionConfigOption = vi.fn(async () => true);
    const thoughtLevelSelector = {
      configId: 'thought-level',
      currentCode: 'medium',
      options: [
        { code: 'medium', value: 'Medium' },
        { code: 'high', value: 'High' },
      ],
    };

    const result = await switchGeminiThoughtLevelIfRequested({
      requestedThoughtLevel: 'ultra',
      thoughtLevelSelector,
      backend: { setSessionConfigOption },
    });

    expect(setSessionConfigOption).not.toHaveBeenCalled();
    expect(result).toEqual({ thoughtLevelSelector });
  });
});
