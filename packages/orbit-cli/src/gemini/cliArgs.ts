export function extractGeminiResumeFlag(args: string[]): {
  resumeSessionId: string | null;
  args: string[];
} {
  const remaining: string[] = [];
  let resumeSessionId: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--resume' || arg === '-r') {
      const value = args[index + 1]?.trim();
      if (!value) {
        throw new Error('Gemini resume requires a session ID: orbit gemini --resume <session-id>');
      }
      resumeSessionId = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--resume=')) {
      const value = arg.slice('--resume='.length).trim();
      if (!value) {
        throw new Error('Gemini resume requires a session ID: orbit gemini --resume <session-id>');
      }
      resumeSessionId = value;
      continue;
    }

    remaining.push(arg);
  }

  return {
    resumeSessionId,
    args: remaining,
  };
}
