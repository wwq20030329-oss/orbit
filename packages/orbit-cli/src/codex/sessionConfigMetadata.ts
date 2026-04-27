import type { Metadata, PermissionMode } from '@/api/types';
import type { ReasoningEffort } from './codexAppServerTypes';

type MetadataOption = {
    code: string;
    value: string;
    description?: string | null;
};

const CODEX_MODEL_OPTIONS: MetadataOption[] = [
    { code: 'default', value: 'default model' },
    { code: 'gpt-5.4', value: 'gpt-5.4' },
    { code: 'gpt-5.4-mini', value: 'gpt-5.4-mini' },
    { code: 'gpt-5.3-codex', value: 'gpt-5.3-codex' },
    { code: 'gpt-5.2-codex', value: 'gpt-5.2-codex' },
    { code: 'gpt-5.1-codex-max', value: 'gpt-5.1-codex-max' },
    { code: 'gpt-5.2', value: 'gpt-5.2' },
    { code: 'gpt-5.1-codex-mini', value: 'gpt-5.1-codex-mini' },
];

const CODEX_MODE_OPTIONS: MetadataOption[] = [
    { code: 'default', value: 'default permissions' },
    { code: 'read-only', value: 'read-only' },
    { code: 'safe-yolo', value: 'safe yolo' },
    { code: 'yolo', value: 'yolo' },
];

const CODEX_THOUGHT_LEVELS: MetadataOption[] = [
    { code: 'none', value: 'none' },
    { code: 'minimal', value: 'minimal' },
    { code: 'low', value: 'low' },
    { code: 'medium', value: 'medium' },
    { code: 'high', value: 'high' },
    { code: 'xhigh', value: 'xhigh' },
];

type CodexSessionConfigState = {
    model?: string | null;
    permissionMode?: PermissionMode | null;
    effortLevel?: ReasoningEffort | null;
};

function normalizeCodexSessionConfigState(state: CodexSessionConfigState): {
    modelCode: string;
    operatingModeCode: string;
    thoughtLevelCode: ReasoningEffort | 'high';
} {
    return {
        modelCode: state.model || 'default',
        operatingModeCode: state.permissionMode || 'default',
        thoughtLevelCode: state.effortLevel || 'high',
    };
}

export function hasCodexSessionConfigChange(
    current: CodexSessionConfigState,
    next: CodexSessionConfigState,
): boolean {
    const currentState = normalizeCodexSessionConfigState(current);
    const nextState = normalizeCodexSessionConfigState(next);

    return currentState.modelCode !== nextState.modelCode
        || currentState.operatingModeCode !== nextState.operatingModeCode
        || currentState.thoughtLevelCode !== nextState.thoughtLevelCode;
}

export function applyCodexSessionConfigMetadata(
    metadata: Metadata,
    state: CodexSessionConfigState,
): Metadata {
    const normalizedState = normalizeCodexSessionConfigState(state);

    return {
        ...metadata,
        models: CODEX_MODEL_OPTIONS,
        currentModelCode: normalizedState.modelCode,
        operatingModes: CODEX_MODE_OPTIONS,
        currentOperatingModeCode: normalizedState.operatingModeCode,
        thoughtLevels: CODEX_THOUGHT_LEVELS,
        currentThoughtLevelCode: normalizedState.thoughtLevelCode,
    };
}
