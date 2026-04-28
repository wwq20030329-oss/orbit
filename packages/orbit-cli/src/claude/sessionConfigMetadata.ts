import type { Metadata, PermissionMode } from '@/api/types';

type MetadataOption = {
    code: string;
    value: string;
    description?: string | null;
};

const CLAUDE_MODEL_OPTIONS: MetadataOption[] = [
    { code: 'default', value: 'default model' },
    { code: 'opus', value: 'opus 4.6' },
    { code: 'sonnet', value: 'sonnet 4.6' },
    { code: 'haiku', value: 'haiku 4.5' },
];

const CLAUDE_MODE_OPTIONS: MetadataOption[] = [
    { code: 'default', value: 'default permissions' },
    { code: 'acceptEdits', value: 'accept edits' },
    { code: 'plan', value: 'plan' },
    { code: 'auto', value: 'auto' },
    { code: 'dontAsk', value: "don't ask" },
    { code: 'bypassPermissions', value: 'yolo' },
];

function getClaudeThoughtLevels(modelCode: string): MetadataOption[] {
    if (modelCode === 'opus') {
        return [
            { code: 'auto', value: 'auto' },
            { code: 'low', value: 'low' },
            { code: 'medium', value: 'medium' },
            { code: 'high', value: 'high' },
            { code: 'xhigh', value: 'xhigh' },
            { code: 'max', value: 'max' },
        ];
    }

    if (modelCode === 'default' || modelCode === 'sonnet') {
        return [
            { code: 'auto', value: 'auto' },
            { code: 'low', value: 'low' },
            { code: 'medium', value: 'medium' },
            { code: 'high', value: 'high' },
            { code: 'max', value: 'max' },
        ];
    }

    return [];
}

function getDefaultClaudeThoughtLevel(modelCode: string): string | undefined {
    if (modelCode === 'opus') {
        return 'xhigh';
    }

    if (modelCode === 'default' || modelCode === 'sonnet') {
        return 'high';
    }

    return undefined;
}

type ClaudeSessionConfigState = {
    model?: string | null;
    permissionMode?: PermissionMode | null;
    effortLevel?: string | null;
};

function normalizeClaudeSessionConfigState(state: ClaudeSessionConfigState): {
    modelCode: string;
    operatingModeCode: string;
    thoughtLevelCode?: string;
} {
    const modelCode = state.model || 'default';
    const operatingModeCode = state.permissionMode || 'default';
    const thoughtLevels = getClaudeThoughtLevels(modelCode);
    const thoughtLevelCode = thoughtLevels.length > 0
        ? (state.effortLevel || getDefaultClaudeThoughtLevel(modelCode))
        : undefined;

    return {
        modelCode,
        operatingModeCode,
        thoughtLevelCode,
    };
}

export function hasClaudeSessionConfigChange(
    current: ClaudeSessionConfigState,
    next: ClaudeSessionConfigState,
): boolean {
    const currentState = normalizeClaudeSessionConfigState(current);
    const nextState = normalizeClaudeSessionConfigState(next);

    return currentState.modelCode !== nextState.modelCode
        || currentState.operatingModeCode !== nextState.operatingModeCode
        || currentState.thoughtLevelCode !== nextState.thoughtLevelCode;
}

export function applyClaudeSessionConfigMetadata(
    metadata: Metadata,
    state: ClaudeSessionConfigState,
): Metadata {
    const normalizedState = normalizeClaudeSessionConfigState(state);
    const thoughtLevels = getClaudeThoughtLevels(normalizedState.modelCode);

    const next: Metadata = {
        ...metadata,
        models: CLAUDE_MODEL_OPTIONS,
        currentModelCode: normalizedState.modelCode,
        operatingModes: CLAUDE_MODE_OPTIONS,
        currentOperatingModeCode: normalizedState.operatingModeCode,
    };

    if (thoughtLevels.length > 0) {
        next.thoughtLevels = thoughtLevels;
        next.currentThoughtLevelCode = normalizedState.thoughtLevelCode;
    } else {
        delete next.thoughtLevels;
        delete next.currentThoughtLevelCode;
    }

    return next;
}
