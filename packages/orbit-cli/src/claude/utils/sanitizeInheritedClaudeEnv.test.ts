import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sanitizeInheritedClaudeEnv } from './sanitizeInheritedClaudeEnv';

const CLAUDE_ENV_KEYS = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

describe('sanitizeInheritedClaudeEnv', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        for (const key of CLAUDE_ENV_KEYS) {
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of CLAUDE_ENV_KEYS) {
            if (originalEnv[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        }
    });

    it('removes inherited Anthropic runtime overrides when a foreign model override is present', () => {
        process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317';
        process.env.ANTHROPIC_AUTH_TOKEN = 'test-token';
        process.env.ANTHROPIC_MODEL = 'gpt-5.4';
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'gpt-5.4';

        const removed = sanitizeInheritedClaudeEnv();

        expect(removed).toEqual(expect.arrayContaining([
            'ANTHROPIC_BASE_URL',
            'ANTHROPIC_AUTH_TOKEN',
            'ANTHROPIC_MODEL',
            'ANTHROPIC_DEFAULT_SONNET_MODEL',
        ]));
        expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined();
        expect(process.env.ANTHROPIC_MODEL).toBeUndefined();
    });

    it('keeps explicitly provided overrides intact', () => {
        process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8317';
        process.env.ANTHROPIC_MODEL = 'gpt-5.4';
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'gpt-5.4';

        const removed = sanitizeInheritedClaudeEnv({
            ANTHROPIC_BASE_URL: 'https://proxy.example.com',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
        });

        expect(removed).toEqual(['ANTHROPIC_DEFAULT_SONNET_MODEL']);
        expect(process.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
        expect(process.env.ANTHROPIC_MODEL).toBe('gpt-5.4');
    });

    it('ignores genuine Claude model overrides', () => {
        process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-6';
        process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

        const removed = sanitizeInheritedClaudeEnv();

        expect(removed).toEqual([]);
        expect(process.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
        expect(process.env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
    });
});
