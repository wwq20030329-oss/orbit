import { describe, expect, it } from 'vitest';
import { applyClaudeSessionEnv } from './effortEnv';

describe('applyClaudeSessionEnv', () => {
    it('applies an explicit session effort level', () => {
        const env: Record<string, string | undefined> = {};

        applyClaudeSessionEnv(env, { FOO: 'bar' }, 'high');

        expect(env).toEqual({
            FOO: 'bar',
            CLAUDE_CODE_EFFORT_LEVEL: 'high',
        });
    });

    it('falls back to the base Claude effort level when session effort is absent', () => {
        const env: Record<string, string | undefined> = {};

        applyClaudeSessionEnv(env, { CLAUDE_CODE_EFFORT_LEVEL: 'medium' });

        expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe('medium');
    });

    it('clears stale Claude effort when neither base env nor session provide one', () => {
        const env: Record<string, string | undefined> = {
            CLAUDE_CODE_EFFORT_LEVEL: 'xhigh',
        };

        applyClaudeSessionEnv(env, { FOO: 'bar' });

        expect(env).toEqual({
            FOO: 'bar',
        });
    });
});
