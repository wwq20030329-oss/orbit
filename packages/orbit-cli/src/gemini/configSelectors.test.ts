import { describe, expect, it } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { extractGeminiConfigSelector, resolveGeminiRequestedCode } from './configSelectors';

function selectOption(input: {
  id: string;
  name: string;
  category?: string;
  currentValue: string;
  options: Array<{ value: string; name: string } | { options: Array<{ value: string; name: string }> }>;
}): SessionConfigOption {
  return {
    type: 'select',
    id: input.id,
    name: input.name,
    category: input.category,
    currentValue: input.currentValue,
    options: input.options,
  } as any;
}

describe('gemini config selectors', () => {
  it('extracts thought level selectors from explicit category', () => {
    const selector = extractGeminiConfigSelector([
      selectOption({
        id: 'reasoning_depth',
        name: 'Thought Level',
        category: 'thought_level',
        currentValue: 'medium',
        options: [
          { value: 'low', name: 'Low' },
          { value: 'medium', name: 'Medium' },
        ],
      }),
    ], 'thought_level');

    expect(selector).toEqual({
      configId: 'reasoning_depth',
      currentCode: 'medium',
      options: [
        { code: 'low', value: 'Low' },
        { code: 'medium', value: 'Medium' },
      ],
    });
  });

  it('falls back to id/name heuristics when category is omitted', () => {
    const selector = extractGeminiConfigSelector([
      selectOption({
        id: 'effort_mode',
        name: 'Effort',
        currentValue: 'high',
        options: [
          { value: 'medium', name: 'Medium' },
          { value: 'high', name: 'High' },
        ],
      }),
    ], 'thought_level');

    expect(selector?.configId).toBe('effort_mode');
    expect(selector?.currentCode).toBe('high');
  });

  it('flattens grouped options and resolves requested codes by code or label', () => {
    const selector = extractGeminiConfigSelector([
      selectOption({
        id: 'model',
        name: 'Model',
        category: 'model',
        currentValue: 'gemini-2.5-pro',
        options: [
          {
            options: [
              { value: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
              { value: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            ],
          },
        ],
      }),
    ], 'model');

    expect(selector?.options).toEqual([
      { code: 'gemini-2.5-pro', value: 'Gemini 2.5 Pro' },
      { code: 'gemini-2.5-flash', value: 'Gemini 2.5 Flash' },
    ]);
    expect(resolveGeminiRequestedCode(selector?.options ?? [], 'gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(resolveGeminiRequestedCode(selector?.options ?? [], 'gemini 2.5 pro')).toBe('gemini-2.5-pro');
  });
});
