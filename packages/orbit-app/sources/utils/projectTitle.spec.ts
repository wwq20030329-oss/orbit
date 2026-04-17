import { describe, expect, it } from 'vitest';

import { buildProjectTitle } from './projectTitle';

describe('buildProjectTitle', () => {
  it('returns the last path segment', () => {
    expect(buildProjectTitle('/Users/test/project')).toBe('project');
  });

  it('ignores trailing slashes', () => {
    expect(buildProjectTitle('/Users/test/project///')).toBe('project');
  });

  it('returns null for empty input', () => {
    expect(buildProjectTitle(null)).toBeNull();
    expect(buildProjectTitle('')).toBeNull();
  });
});
