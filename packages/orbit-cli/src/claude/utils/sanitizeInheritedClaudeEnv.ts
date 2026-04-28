const CLAUDE_MODEL_OVERRIDE_KEYS = [
    'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

const CLAUDE_RUNTIME_OVERRIDE_KEYS = [
    ...CLAUDE_MODEL_OVERRIDE_KEYS,
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
] as const;

function looksLikeForeignModelOverride(value: string | undefined): boolean {
    if (!value) {
        return false;
    }

    return /^(gpt|o[1345]|codex|gemini)/i.test(value.trim());
}

export function sanitizeInheritedClaudeEnv(
    explicitClaudeEnvVars?: Record<string, string>,
): string[] {
    const hasForeignModelOverride = CLAUDE_MODEL_OVERRIDE_KEYS.some((key) => {
        if (explicitClaudeEnvVars?.[key] !== undefined) {
            return false;
        }
        return looksLikeForeignModelOverride(process.env[key]);
    });

    if (!hasForeignModelOverride) {
        return [];
    }

    const removedKeys: string[] = [];
    for (const key of CLAUDE_RUNTIME_OVERRIDE_KEYS) {
        if (explicitClaudeEnvVars?.[key] !== undefined) {
            continue;
        }
        if (process.env[key] === undefined) {
            continue;
        }
        delete process.env[key];
        removedKeys.push(key);
    }

    return removedKeys;
}
