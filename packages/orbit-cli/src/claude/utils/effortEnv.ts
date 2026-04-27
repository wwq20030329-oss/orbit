export function applyClaudeSessionEnv(
    targetEnv: Record<string, string | undefined>,
    baseEnvVars?: Record<string, string>,
    effortLevel?: string,
): void {
    if (baseEnvVars) {
        for (const [key, value] of Object.entries(baseEnvVars)) {
            targetEnv[key] = value;
        }
    }

    const desiredEffortLevel = typeof effortLevel === 'string' && effortLevel.length > 0
        ? effortLevel
        : baseEnvVars?.CLAUDE_CODE_EFFORT_LEVEL;

    if (desiredEffortLevel) {
        targetEnv.CLAUDE_CODE_EFFORT_LEVEL = desiredEffortLevel;
        return;
    }

    delete targetEnv.CLAUDE_CODE_EFFORT_LEVEL;
}
