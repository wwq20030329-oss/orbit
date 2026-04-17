import { describe, expect, it } from 'vitest';
import {
    getAvailableEffortLevels,
    getAvailableModels,
    getAvailablePermissionModes,
    getAvailableSessionModels,
    getAvailableSessionPermissionModes,
    getCodexModelModes,
    getClaudePermissionModes,
    mapMetadataOptions,
    resolveCurrentOption,
} from './modelModeOptions';

const translate = (key: string) => `tr:${key}`;

describe('modelModeOptions', () => {
    it('maps metadata option shape into mode options', () => {
        expect(mapMetadataOptions([
            { code: 'm1', value: 'Model One', description: 'Primary model' },
            { code: 'm2', value: 'Model Two' },
        ])).toEqual([
            { key: 'm1', name: 'Model One', description: 'Primary model' },
            { key: 'm2', name: 'Model Two', description: null },
        ]);
    });

    it('builds claude permission fallbacks with translated names', () => {
        const modes = getClaudePermissionModes(translate);
        expect(modes.map((mode) => mode.key)).toEqual([
            'default',
            'acceptEdits',
            'plan',
            'auto',
            'dontAsk',
            'bypassPermissions',
        ]);
        expect(modes[0].name).toBe('tr:agentInput.permissionMode.default');
        expect(modes[3].name).toBe('tr:agentInput.permissionMode.auto');
        expect(modes[4].name).toBe('tr:agentInput.permissionMode.dontAsk');
    });

    it('builds codex model fallbacks', () => {
        const models = getCodexModelModes();
        expect(models.map((model) => model.key)).toEqual([
            'default',
            'gpt-5.4',
            'gpt-5.4-mini',
            'gpt-5.3-codex',
            'gpt-5.2-codex',
            'gpt-5.1-codex-max',
            'gpt-5.2',
            'gpt-5.1-codex-mini',
        ]);
        expect(models[0].name).toBe('default model');
        expect(models[1].name).toBe('gpt-5.4');
    });

    it('prefers metadata models over hardcoded fallbacks', () => {
        const models = getAvailableModels('gemini', {
            models: [
                { code: 'custom-gemini', value: 'Gemini Custom', description: 'From metadata' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'custom-gemini', name: 'Gemini Custom', description: 'From metadata' },
        ]);
    });

    it('adds codex default model option when metadata models are present', () => {
        const models = getAvailableModels('codex', {
            models: [
                { code: 'gpt-5.4', value: 'gpt-5.4', description: 'Latest' },
            ],
        } as any, translate);

        expect(models).toEqual([
            { key: 'default', name: 'default model', description: null },
            { key: 'gpt-5.4', name: 'gpt-5.4', description: 'Latest' },
        ]);
    });

    it('prefers metadata permission modes when available', () => {
        const modes = getAvailablePermissionModes('codex', {
            operatingModes: [{ code: 'metadata-only', value: 'Metadata Mode', description: null }],
        } as any, translate);

        expect(modes.map((mode) => mode.key)).toEqual(['metadata-only']);
    });

    it('applies hacks to metadata-provided operating modes', () => {
        const modes = getAvailablePermissionModes('gemini', {
            operatingModes: [
                { code: 'build', value: 'build, build', description: 'Do build steps' },
                { code: 'plan', value: 'plan/plan', description: 'Plan first' },
            ],
        } as any, translate);

        expect(modes).toEqual([
            { key: 'build', name: 'Build', description: 'Do build steps' },
            { key: 'plan', name: 'tr:agentInput.geminiPermissionMode.plan', description: 'Plan first' },
        ]);
    });

    it('falls back to codex session permission modes when metadata is missing', () => {
        const modes = getAvailableSessionPermissionModes('codex', undefined, translate);
        expect(modes.map((mode) => mode.key)).toEqual(['default', 'read-only', 'safe-yolo', 'yolo']);
        expect(modes.map((mode) => mode.name)).toEqual([
            'tr:agentInput.codexPermissionMode.default',
            'tr:agentInput.codexPermissionMode.readOnly',
            'tr:agentInput.codexPermissionMode.safeYolo',
            'tr:agentInput.codexPermissionMode.yolo',
        ]);

        const metadataModes = getAvailableSessionPermissionModes('codex', {
            operatingModes: [{ code: 'on-request', value: 'Suggest', description: 'Official codex mode' }],
        } as any, translate);
        expect(metadataModes).toEqual([
            { key: 'on-request', name: 'Suggest', description: 'Official codex mode' },
        ]);
    });

    it('localizes known metadata permission modes while preserving unknown ones', () => {
        const modes = getAvailablePermissionModes('codex', {
            operatingModes: [
                { code: 'read-only', value: 'Read only mode', description: null },
                { code: 'safe-yolo', value: 'Auto', description: null },
                { code: 'custom-mode', value: 'Custom Mode', description: 'Team specific' },
            ],
        } as any, translate);

        expect(modes).toEqual([
            { key: 'read-only', name: 'tr:agentInput.codexPermissionMode.readOnly', description: null },
            { key: 'safe-yolo', name: 'tr:agentInput.codexPermissionMode.safeYolo', description: null },
            { key: 'custom-mode', name: 'Custom Mode', description: 'Team specific' },
        ]);
    });

    it('falls back to gemini session models when metadata is missing', () => {
        const models = getAvailableSessionModels('gemini', undefined, translate);
        expect(models.map((model) => model.key)).toEqual([
            'gemini-3.1-pro-preview',
            'gemini-3-flash-preview',
            'gemini-3.1-flash-lite-preview',
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'gemini-2.5-flash-lite',
        ]);

        const metadataModels = getAvailableSessionModels('gemini', {
            models: [{ code: 'gemini-2.5-pro', value: 'Gemini 2.5 Pro', description: 'Official model' }],
        } as any, translate);
        expect(metadataModels).toEqual([
            { key: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Official model' },
        ]);
    });

    it('keeps claude session setting fallbacks when metadata is missing', () => {
        const modes = getAvailableSessionPermissionModes('claude', undefined, translate);
        const models = getAvailableSessionModels('claude', undefined, translate);

        expect(modes.map((mode) => mode.key)).toEqual([
            'default',
            'acceptEdits',
            'plan',
            'auto',
            'dontAsk',
            'bypassPermissions',
        ]);
        expect(models.map((model) => model.key)).toEqual(['default', 'opus', 'sonnet', 'haiku']);
    });

    it('uses runtime-supported gemini fallback permission modes', () => {
        const modes = getAvailableSessionPermissionModes('gemini', undefined, translate);

        expect(modes).toEqual([
            { key: 'default', name: 'tr:agentInput.geminiPermissionMode.default', description: null },
            { key: 'auto_edit', name: 'tr:agentInput.geminiPermissionMode.autoEdit', description: null },
            { key: 'plan', name: 'tr:agentInput.geminiPermissionMode.plan', description: null },
        ]);
    });

    it('prefers metadata thought levels and localizes known labels', () => {
        const levels = getAvailableEffortLevels('codex', {
            thoughtLevels: [
                { code: 'low', value: 'Low reasoning', description: null },
                { code: 'custom', value: 'Deep dive', description: 'Team preset' },
            ],
        } as any, 'gpt-5.4', translate);

        expect(levels).toEqual([
            { key: 'low', name: 'tr:agentInput.effort.low', description: null },
            { key: 'custom', name: 'Deep dive', description: 'Team preset' },
        ]);
    });

    it('falls back to translated hardcoded effort levels when metadata is missing', () => {
        const levels = getAvailableEffortLevels('codex', undefined, 'gpt-5.4', translate);

        expect(levels.map((level) => level.key)).toEqual(['low', 'medium', 'high', 'xhigh']);
        expect(levels.map((level) => level.name)).toEqual([
            'tr:agentInput.effort.low',
            'tr:agentInput.effort.medium',
            'tr:agentInput.effort.high',
            'tr:agentInput.effort.xhigh',
        ]);
    });

    it('falls back to localized Claude effort levels for supported models', () => {
        const levels = getAvailableEffortLevels('claude', undefined, 'opus', translate);

        expect(levels.map((level) => level.key)).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
        expect(levels.map((level) => level.name)).toEqual([
            'tr:agentInput.effort.auto',
            'tr:agentInput.effort.low',
            'tr:agentInput.effort.medium',
            'tr:agentInput.effort.high',
            'tr:agentInput.effort.xhigh',
            'tr:agentInput.effort.max',
        ]);
    });

    it('resolves the first matching preferred key', () => {
        const options = [
            { key: 'a', name: 'A' },
            { key: 'b', name: 'B' },
        ];

        expect(resolveCurrentOption(options, ['missing', 'b', 'a'])).toEqual({ key: 'b', name: 'B' });
        expect(resolveCurrentOption(options, ['missing'])).toBeNull();
    });
});
