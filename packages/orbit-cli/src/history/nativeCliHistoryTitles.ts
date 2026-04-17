export function cleanGeminiTitle(text: string): string | null {
  const withoutContext = text.replace(/\[PREVIOUS CONVERSATION CONTEXT\][\s\S]*?\[END OF PREVIOUS CONTEXT\]\s*/g, '');
  return cleanTitle(withoutContext);
}

export function pickPreferredTitle(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const cleaned = pickMeaningfulTitle(candidate);
    if (cleaned) {
      return cleaned;
    }
  }

  for (const candidate of candidates) {
    const cleaned = typeof candidate === 'string' ? candidate.trim() : '';
    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

export function pickMeaningfulTitle(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }

  const cleaned = candidate.trim();
  if (!cleaned || isTrivialTitle(cleaned)) {
    return null;
  }

  return cleaned;
}

export function isTrivialTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return [
    'hello',
    'hi',
    'hey',
    'yo',
    'ok',
    'okay',
    'test',
    'testing',
    '你好',
    '您好',
    '嗨',
    '测试',
  ].includes(normalized);
}

export function cleanTitle(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.length > 96 ? `${cleaned.slice(0, 95)}…` : cleaned;
}
