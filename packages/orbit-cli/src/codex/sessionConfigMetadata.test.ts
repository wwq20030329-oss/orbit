import { describe, expect, it } from 'vitest';
import { applyCodexSessionConfigMetadata, hasCodexSessionConfigChange } from './sessionConfigMetadata';

describe('applyCodexSessionConfigMetadata', () => {
    it('seeds Codex metadata with supported models, modes, and thought levels', () => {
        const next = applyCodexSessionConfigMetadata({ path: '/tmp', host: 'host' } as any, {
            model: 'gpt-5.4-mini',
            permissionMode: 'safe-yolo',
            effortLevel: 'minimal',
        });

        expect(next.models?.map((entry) => entry.code)).toEqual([
            'default',
            'gpt-5.4',
            'gpt-5.4-mini',
            'gpt-5.3-codex',
            'gpt-5.2-codex',
            'gpt-5.1-codex-max',
            'gpt-5.2',
            'gpt-5.1-codex-mini',
        ]);
        expect(next.currentModelCode).toBe('gpt-5.4-mini');
        expect(next.operatingModes?.map((entry) => entry.code)).toEqual(['default', 'read-only', 'safe-yolo', 'yolo']);
        expect(next.currentOperatingModeCode).toBe('safe-yolo');
        expect(next.thoughtLevels?.map((entry) => entry.code)).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
        expect(next.currentThoughtLevelCode).toBe('minimal');
    });

    it('defaults to default model, default mode, and high effort', () => {
        const next = applyCodexSessionConfigMetadata({ path: '/tmp', host: 'host' } as any, {});

        expect(next.currentModelCode).toBe('default');
        expect(next.currentOperatingModeCode).toBe('default');
        expect(next.currentThoughtLevelCode).toBe('high');
    });

    it('treats equivalent effective settings as unchanged', () => {
        expect(hasCodexSessionConfigChange({}, {
            model: 'default',
            permissionMode: 'default',
            effortLevel: 'high',
        })).toBe(false);
    });

    it('detects changes when the effective setting changes', () => {
        expect(hasCodexSessionConfigChange({
            model: 'default',
            permissionMode: 'default',
            effortLevel: 'high',
        }, {
            model: 'gpt-5.4-mini',
            permissionMode: 'default',
            effortLevel: 'high',
        })).toBe(true);
    });
});
