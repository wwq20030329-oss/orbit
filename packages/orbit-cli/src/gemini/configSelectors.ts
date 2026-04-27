import type { SessionConfigOption } from '@agentclientprotocol/sdk';

export type GeminiSelectorCategory = 'mode' | 'model' | 'thought_level';

export type GeminiSelectableOption = {
  code: string;
  value: string;
};

export type GeminiConfigSelector = {
  configId: string;
  currentCode: string;
  options: GeminiSelectableOption[];
};

type SelectValue = {
  value: string;
  name: string;
};

type SelectGroup = {
  options: SelectValue[];
};

function isSelectValue(value: unknown): value is SelectValue {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as { value?: unknown }).value === 'string'
    && typeof (value as { name?: unknown }).name === 'string';
}

function isSelectGroup(value: unknown): value is SelectGroup {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Array.isArray((value as { options?: unknown }).options);
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function flattenSelectOptions(options: unknown): GeminiSelectableOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  const flattened: GeminiSelectableOption[] = [];

  for (const entry of options) {
    if (isSelectValue(entry)) {
      flattened.push({ code: entry.value, value: entry.name });
      continue;
    }

    if (!isSelectGroup(entry)) {
      continue;
    }

    for (const grouped of entry.options) {
      if (!isSelectValue(grouped)) {
        continue;
      }
      flattened.push({ code: grouped.value, value: grouped.name });
    }
  }

  return flattened;
}

function optionMatchesCategory(option: SessionConfigOption, category: GeminiSelectorCategory): boolean {
  if (option.category === category) {
    return true;
  }

  const id = normalizeComparable(option.id);
  const name = normalizeComparable(option.name);

  if (category === 'model') {
    return id.includes('model') || name.includes('model');
  }

  if (category === 'thought_level') {
    return id.includes('thought') || id.includes('effort') || name.includes('thought') || name.includes('effort');
  }

  return id.includes('mode') || id.includes('permission') || name.includes('mode') || name.includes('permission');
}

export function extractGeminiConfigSelector(
  configOptions: SessionConfigOption[],
  category: GeminiSelectorCategory,
): GeminiConfigSelector | null {
  for (const option of configOptions) {
    if (option.type !== 'select' || !optionMatchesCategory(option, category)) {
      continue;
    }

    return {
      configId: option.id,
      currentCode: option.currentValue,
      options: flattenSelectOptions(option.options),
    };
  }

  return null;
}

export function resolveGeminiRequestedCode(
  options: GeminiSelectableOption[],
  requested: string,
): string | null {
  for (const option of options) {
    if (option.code === requested || option.value === requested) {
      return option.code;
    }
  }

  const normalizedRequested = normalizeComparable(requested);
  for (const option of options) {
    if (normalizeComparable(option.code) === normalizedRequested || normalizeComparable(option.value) === normalizedRequested) {
      return option.code;
    }
  }

  return null;
}
