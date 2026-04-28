import { describe, expect, it } from 'vitest';
import { applyClaudeSessionConfigMetadata, hasClaudeSessionConfigChange } from './sessionConfigMetadata';

describe('applyClaudeSessionConfigMetadata', () => {
    it('seeds Claude metadata with model, permission, and thought options', () => {
        const next = applyClaudeSessionConfigMetadata({ path: '/tmp', host: 'host' } as any, {
            model: 'default',
            permissionMode: 'auto',
        });

        expect(next.currentModelCode).toBe('default');
        expect(next.currentOperatingModeCode).toBe('auto');
        expect(next.models?.map((entry) => entry.code)).toEqual(['default', 'opus', 'sonnet', 'haiku']);
        expect(next.operatingModes?.map((entry) => entry.code)).toEqual([
            'default',
            'acceptEdits',
            'plan',
            'auto',
            'dontAsk',
            'bypassPermissions',
        ]);
        expect(next.thoughtLevels?.map((entry) => entry.code)).toEqual(['auto', 'low', 'medium', 'high', 'max']);
        expect(next.currentThoughtLevelCode).toBe('high');
    });

    it('uses the explicit effort level when provided', () => {
        const next = applyClaudeSessionConfigMetadata({ path: '/tmp', host: 'host' } as any, {
            model: 'opus',
            effortLevel: 'max',
        });

        expect(next.currentModelCode).toBe('opus');
        expect(next.thoughtLevels?.map((entry) => entry.code)).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
        expect(next.currentThoughtLevelCode).toBe('max');
    });

    it('clears thought levels for models that do not support them', () => {
        const next = applyClaudeSessionConfigMetadata({
            path: '/tmp',
            host: 'host',
            thoughtLevels: [{ code: 'high', value: 'high' }],
            currentThoughtLevelCode: 'high',
        } as any, {
            model: 'haiku',
        });

        expect(next.currentModelCode).toBe('haiku');
        expect(next.thoughtLevels).toBeUndefined();
        expect(next.currentThoughtLevelCode).toBeUndefined();
    });

    it('treats equivalent effective settings as unchanged', () => {
        expect(hasClaudeSessionConfigChange(
            {
                model: undefined,
                permissionMode: undefined,
                effortLevel: undefined,
            },
            {
                model: 'default',
                permissionMode: 'default',
                effortLevel: 'high',
            },
        )).toBe(false);
    });

    it('detects changes when the effective setting actually changes', () => {
        expect(hasClaudeSessionConfigChange(
            {
                model: 'default',
                permissionMode: 'auto',
                effortLevel: 'high',
            },
            {
                model: 'opus',
                permissionMode: 'auto',
                effortLevel: 'high',
            },
        )).toBe(true);
    });
});
