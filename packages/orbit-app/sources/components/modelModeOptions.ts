import type { Metadata } from '@/sync/storageTypes';
import { hackModes } from '@/sync/modeHacks';

export type ModeOption = {
    key: string;
    name: string;
    description?: string | null;
};

export type PermissionMode = ModeOption;
export type ModelMode = ModeOption;

export type EffortLevel = ModeOption;
export type PermissionModeKey = string;
export type ModelModeKey = string;

export type AgentFlavor = 'claude' | 'codex' | 'gemini' | string | null | undefined;

type Translate = (key: any) => string;

type MetadataOption = {
    code: string;
    value: string;
    description?: string | null;
};

type MetadataOptionCategory = 'model' | 'permission' | 'thought';

const GEMINI_MODEL_FALLBACKS: ModelMode[] = [
    { key: 'gemini-3.1-pro-preview', name: 'gemini 3.1 pro', description: 'latest & most capable' },
    { key: 'gemini-3-flash-preview', name: 'gemini 3 flash', description: 'latest & fast' },
    { key: 'gemini-3.1-flash-lite-preview', name: 'gemini 3.1 flash lite', description: 'latest & fastest' },
    { key: 'gemini-2.5-pro', name: 'gemini 2.5 pro', description: 'most capable' },
    { key: 'gemini-2.5-flash', name: 'gemini 2.5 flash', description: 'fast & efficient' },
    { key: 'gemini-2.5-flash-lite', name: 'gemini 2.5 flash lite', description: 'fastest' },
];

function localizePermissionModeName(
    flavor: AgentFlavor,
    code: string,
    fallbackName: string,
    translate: Translate,
): string {
    switch (flavor) {
        case 'codex':
            switch (code) {
                case 'default':
                    return translate('agentInput.codexPermissionMode.default');
                case 'read-only':
                    return translate('agentInput.codexPermissionMode.readOnly');
                case 'safe-yolo':
                    return translate('agentInput.codexPermissionMode.safeYolo');
                case 'yolo':
                    return translate('agentInput.codexPermissionMode.yolo');
                default:
                    return fallbackName;
            }
        case 'gemini':
            switch (code) {
                case 'default':
                    return translate('agentInput.geminiPermissionMode.default');
                case 'auto_edit':
                    return translate('agentInput.geminiPermissionMode.autoEdit');
                case 'plan':
                    return translate('agentInput.geminiPermissionMode.plan');
                default:
                    return fallbackName;
            }
        case 'openclaw':
        case 'claude':
        default:
            switch (code) {
                case 'default':
                    return translate('agentInput.permissionMode.default');
                case 'acceptEdits':
                    return translate('agentInput.permissionMode.acceptEdits');
                case 'plan':
                    return translate('agentInput.permissionMode.plan');
                case 'auto':
                    return translate('agentInput.permissionMode.auto');
                case 'dontAsk':
                    return translate('agentInput.permissionMode.dontAsk');
                case 'bypassPermissions':
                    return translate('agentInput.permissionMode.bypassPermissions');
                default:
                    return fallbackName;
            }
    }
}

function localizeEffortLevelName(code: string, fallbackName: string, translate: Translate): string {
    switch (code) {
        case 'auto':
            return translate('agentInput.effort.auto');
        case 'none':
            return translate('agentInput.effort.none');
        case 'minimal':
            return translate('agentInput.effort.minimal');
        case 'low':
            return translate('agentInput.effort.low');
        case 'medium':
            return translate('agentInput.effort.medium');
        case 'high':
            return translate('agentInput.effort.high');
        case 'xhigh':
            return translate('agentInput.effort.xhigh');
        case 'max':
            return translate('agentInput.effort.max');
        default:
            return fallbackName;
    }
}

function localizeMetadataOption(
    category: MetadataOptionCategory,
    flavor: AgentFlavor,
    option: MetadataOption,
    translate: Translate,
): ModeOption {
    const fallbackName = option.value;
    const name = category === 'permission'
        ? localizePermissionModeName(flavor, option.code, fallbackName, translate)
        : category === 'thought'
            ? localizeEffortLevelName(option.code, fallbackName, translate)
            : fallbackName;

    return {
        key: option.code,
        name,
        description: option.description ?? null,
    };
}

export function mapMetadataOptions(
    options?: MetadataOption[] | null,
    config?: {
        category?: MetadataOptionCategory;
        flavor?: AgentFlavor;
        translate?: Translate;
    },
): ModeOption[] {
    if (!options || options.length === 0) {
        return [];
    }

    if (!config?.category || !config.translate) {
        return options.map((option) => ({
            key: option.code,
            name: option.value,
            description: option.description ?? null,
        }));
    }

    return options.map((option) => localizeMetadataOption(
        config.category!,
        config.flavor,
        option,
        config.translate!,
    ));
}

export function getClaudePermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.permissionMode.default'), description: null },
        { key: 'acceptEdits', name: translate('agentInput.permissionMode.acceptEdits'), description: null },
        { key: 'plan', name: translate('agentInput.permissionMode.plan'), description: null },
        { key: 'auto', name: translate('agentInput.permissionMode.auto'), description: null },
        { key: 'dontAsk', name: translate('agentInput.permissionMode.dontAsk'), description: null },
        { key: 'bypassPermissions', name: translate('agentInput.permissionMode.bypassPermissions'), description: null },
    ];
}

export function getCodexPermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.codexPermissionMode.default'), description: null },
        { key: 'read-only', name: translate('agentInput.codexPermissionMode.readOnly'), description: null },
        { key: 'safe-yolo', name: translate('agentInput.codexPermissionMode.safeYolo'), description: null },
        { key: 'yolo', name: translate('agentInput.codexPermissionMode.yolo'), description: null },
    ];
}

export function getGeminiPermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.geminiPermissionMode.default'), description: null },
        { key: 'auto_edit', name: translate('agentInput.geminiPermissionMode.autoEdit'), description: null },
        { key: 'plan', name: translate('agentInput.geminiPermissionMode.plan'), description: null },
    ];
}

export function getClaudeModelModes(): ModelMode[] {
    return [
        { key: 'default', name: 'default model', description: null },
        { key: 'opus', name: 'opus 4.6', description: null },
        { key: 'sonnet', name: 'sonnet 4.6', description: null },
        { key: 'haiku', name: 'haiku 4.5', description: null },
    ];
}

export function getCodexModelModes(): ModelMode[] {
    return [
        { key: 'default', name: 'default model', description: null },
        { key: 'gpt-5.4', name: 'gpt-5.4', description: null },
        { key: 'gpt-5.4-mini', name: 'gpt-5.4-mini', description: null },
        { key: 'gpt-5.3-codex', name: 'gpt-5.3-codex', description: null },
        { key: 'gpt-5.2-codex', name: 'gpt-5.2-codex', description: null },
        { key: 'gpt-5.1-codex-max', name: 'gpt-5.1-codex-max', description: null },
        { key: 'gpt-5.2', name: 'gpt-5.2', description: null },
        { key: 'gpt-5.1-codex-mini', name: 'gpt-5.1-codex-mini', description: null },
    ];
}

export function getGeminiModelModes(): ModelMode[] {
    return GEMINI_MODEL_FALLBACKS;
}

export function getOpenClawPermissionModes(translate: Translate): PermissionMode[] {
    return [
        { key: 'default', name: translate('agentInput.permissionMode.default'), description: null },
        { key: 'bypassPermissions', name: translate('agentInput.permissionMode.bypassPermissions'), description: null },
    ];
}

export function getHardcodedPermissionModes(flavor: AgentFlavor, translate: Translate): PermissionMode[] {
    if (flavor === 'codex') {
        return getCodexPermissionModes(translate);
    }
    if (flavor === 'gemini') {
        return getGeminiPermissionModes(translate);
    }
    if (flavor === 'openclaw') {
        return getOpenClawPermissionModes(translate);
    }
    return getClaudePermissionModes(translate);
}

export function getOpenClawModelModes(): ModelMode[] {
    return [
        { key: 'default', name: 'default model', description: null },
    ];
}

export function getHardcodedModelModes(flavor: AgentFlavor, _translate: Translate): ModelMode[] {
    if (flavor === 'codex') {
        return getCodexModelModes();
    }
    if (flavor === 'gemini') {
        return getGeminiModelModes();
    }
    if (flavor === 'openclaw') {
        return getOpenClawModelModes();
    }
    return getClaudeModelModes();
}

export function getAvailableModels(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): ModelMode[] {
    const metadataModels = mapMetadataOptions(metadata?.models);
    if (metadataModels.length > 0) {
        if (flavor === 'codex' && !metadataModels.some((model) => model.key === 'default')) {
            return [{ key: 'default', name: 'default model', description: null }, ...metadataModels];
        }
        return metadataModels;
    }
    return getHardcodedModelModes(flavor, translate);
}

export function getAvailablePermissionModes(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): PermissionMode[] {
    const metadataModes = mapMetadataOptions(metadata?.operatingModes, {
        category: 'permission',
        flavor,
        translate,
    });
    if (metadataModes.length > 0) {
        return hackModes(metadataModes);
    }

    return hackModes(getHardcodedPermissionModes(flavor, translate));
}

export function getAvailableSessionModels(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): ModelMode[] {
    const metadataModels = mapMetadataOptions(metadata?.models);
    if (metadataModels.length > 0) {
        if (flavor === 'codex' && !metadataModels.some((model) => model.key === 'default')) {
            return [{ key: 'default', name: 'default model', description: null }, ...metadataModels];
        }
        return metadataModels;
    }
    return getHardcodedModelModes(flavor, translate);
}

export function getAvailableSessionPermissionModes(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    translate: Translate,
): PermissionMode[] {
    const metadataModes = mapMetadataOptions(metadata?.operatingModes, {
        category: 'permission',
        flavor,
        translate,
    });
    if (metadataModes.length > 0) {
        return hackModes(metadataModes);
    }

    return hackModes(getHardcodedPermissionModes(flavor, translate));
}

export function findOptionByKey<T extends ModeOption>(options: T[], key: string | null | undefined): T | null {
    if (!key) {
        return null;
    }
    return options.find((option) => option.key === key) ?? null;
}

export function resolveCurrentOption<T extends ModeOption>(
    options: T[],
    preferredKeys: Array<string | null | undefined>,
): T | null {
    for (const key of preferredKeys) {
        const option = findOptionByKey(options, key);
        if (option) {
            return option;
        }
    }
    return null;
}

export function getDefaultModelKey(flavor: AgentFlavor): string {
    if (flavor === 'codex') {
        return 'default';
    }
    if (flavor === 'gemini') {
        return 'gemini-2.5-pro';
    }
    return 'default';
}

export function getDefaultPermissionModeKey(_flavor: AgentFlavor): string {
    return 'default';
}

// Effort levels per agent type

export function getClaudeEffortLevels(modelKey: string): EffortLevel[] {
    if (modelKey === 'opus') {
        return [
            { key: 'auto', name: 'auto' },
            { key: 'low', name: 'low' },
            { key: 'medium', name: 'medium' },
            { key: 'high', name: 'high' },
            { key: 'xhigh', name: 'xhigh' },
            { key: 'max', name: 'max' },
        ];
    }

    if (modelKey === 'default' || modelKey === 'sonnet') {
        return [
            { key: 'auto', name: 'auto' },
            { key: 'low', name: 'low' },
            { key: 'medium', name: 'medium' },
            { key: 'high', name: 'high' },
            { key: 'max', name: 'max' },
        ];
    }

    return [];
}

export function getCodexEffortLevels(): EffortLevel[] {
    return [
        { key: 'low', name: 'low' },
        { key: 'medium', name: 'medium' },
        { key: 'high', name: 'high' },
        { key: 'xhigh', name: 'xhigh' },
    ];
}

export function getHardcodedEffortLevels(flavor: AgentFlavor): EffortLevel[] {
    if (flavor === 'claude') return getClaudeEffortLevels('sonnet');
    if (flavor === 'codex') return getCodexEffortLevels();
    return [];
}

export function getDefaultEffortKey(flavor: AgentFlavor): string | null {
    if (flavor === 'claude' || flavor === 'codex') return 'high';
    return null;
}

// Per-model effort: returns effort levels for a specific model, or empty if the model has no effort
export function getEffortLevelsForModel(flavor: AgentFlavor, modelKey: string): EffortLevel[] {
    if (flavor === 'claude') {
        return getClaudeEffortLevels(modelKey);
    }
    if (flavor === 'codex') {
        return getCodexEffortLevels();
    }
    return [];
}

export function getAvailableEffortLevels(
    flavor: AgentFlavor,
    metadata: Metadata | null | undefined,
    modelKey: string,
    translate: Translate,
): EffortLevel[] {
    const metadataThoughtLevels = mapMetadataOptions(metadata?.thoughtLevels, {
        category: 'thought',
        flavor,
        translate,
    });
    if (metadataThoughtLevels.length > 0) {
        return metadataThoughtLevels;
    }

    if (flavor !== 'codex' && flavor !== 'claude') {
        return [];
    }

    return getEffortLevelsForModel(flavor, modelKey).map((level) => ({
        ...level,
        name: localizeEffortLevelName(level.key, level.name, translate),
    }));
}

// Default effort for a model — highest the model allows
export function getDefaultEffortKeyForModel(flavor: AgentFlavor, modelKey: string): string | null {
    if (flavor === 'claude') {
        if (modelKey === 'opus') {
            return 'xhigh';
        }
        if (modelKey === 'default' || modelKey === 'sonnet') {
            return 'high';
        }
        return null;
    }

    const levels = getEffortLevelsForModel(flavor, modelKey);
    if (levels.length === 0) return null;
    return levels[levels.length - 1].key;
}

export function getSupportsWorktree(flavor: AgentFlavor): boolean {
    if (flavor === 'openclaw') return false;
    return true;
}
