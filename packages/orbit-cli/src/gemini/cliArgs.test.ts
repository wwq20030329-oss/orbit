import { describe, expect, it } from 'vitest';

import { extractGeminiResumeFlag } from './cliArgs';

describe('extractGeminiResumeFlag', () => {
  it('extracts a spaced resume flag', () => {
    expect(extractGeminiResumeFlag(['--resume', 'session-123', '--started-by', 'daemon'])).toEqual({
      resumeSessionId: 'session-123',
      args: ['--started-by', 'daemon'],
    });
  });

  it('extracts an equals resume flag', () => {
    expect(extractGeminiResumeFlag(['--resume=session-456', '--started-by', 'terminal'])).toEqual({
      resumeSessionId: 'session-456',
      args: ['--started-by', 'terminal'],
    });
  });

  it('throws when resume flag is missing its value', () => {
    expect(() => extractGeminiResumeFlag(['--resume'])).toThrow(
      'Gemini resume requires a session ID: orbit gemini --resume <session-id>',
    );
  });
});
