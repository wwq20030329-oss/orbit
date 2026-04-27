/**
 * Zustand store for new session draft state, backed by MMKV.
 * Persists the user's last-used configuration (machine, path, agent, model, permissions, etc.)
 * so the new session screen restores the same defaults on next visit.
 */
import { InteractionManager } from 'react-native';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
    loadNewSessionDraft,
    saveNewSessionDraft,
    type NewSessionDraft,
    type NewSessionAgentType,
    type NewSessionSessionType,
} from '@/sync/persistence';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

interface NewSessionDraftState {
    input: string;
    selectedMachineId: string | null;
    selectedPath: string | null;
    agentType: NewSessionAgentType;
    permissionMode: PermissionModeKey;
    modelMode: string;
    sessionType: NewSessionSessionType;

    setInput: (input: string) => void;
    setMachineId: (id: string | null) => void;
    setPath: (path: string | null) => void;
    setAgentType: (agent: NewSessionAgentType) => void;
    setPermissionMode: (mode: PermissionModeKey) => void;
    setModelMode: (mode: string) => void;
    setSessionType: (type: NewSessionSessionType) => void;
}

type PersistedDraftSnapshot = Pick<
    NewSessionDraft,
    'input' | 'selectedMachineId' | 'selectedPath' | 'agentType' | 'permissionMode' | 'modelMode' | 'sessionType'
>;

type NewSessionDraftValues = Pick<
    NewSessionDraftState,
    'selectedMachineId' | 'selectedPath' | 'agentType' | 'permissionMode' | 'modelMode'
>;

type NewSessionDraftActions = Pick<
    NewSessionDraftState,
    'setInput' | 'setMachineId' | 'setPath' | 'setAgentType' | 'setPermissionMode' | 'setModelMode' | 'setSessionType'
>;

type NewSessionDraftInput = Pick<NewSessionDraftState, 'input' | 'setInput'>;

const INPUT_PERSIST_DEBOUNCE_MS = 240;
const CONFIG_PERSIST_DEBOUNCE_MS = 120;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingInteractionPersist: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

function persist(state: PersistedDraftSnapshot) {
    saveNewSessionDraft({
        input: state.input,
        selectedMachineId: state.selectedMachineId,
        selectedPath: state.selectedPath,
        agentType: state.agentType,
        permissionMode: state.permissionMode,
        modelMode: state.modelMode,
        sessionType: state.sessionType,
        updatedAt: Date.now(),
    });
}

function cancelScheduledPersist() {
    if (!persistTimer) {
        return;
    }

    clearTimeout(persistTimer);
    persistTimer = null;
}

function cancelScheduledInteractionPersist() {
    if (!pendingInteractionPersist) {
        return;
    }

    pendingInteractionPersist.cancel();
    pendingInteractionPersist = null;
}

function schedulePersist(state: NewSessionDraftState, delayMs: number) {
    cancelScheduledPersist();
    cancelScheduledInteractionPersist();
    const snapshot = {
        input: state.input,
        selectedMachineId: state.selectedMachineId,
        selectedPath: state.selectedPath,
        agentType: state.agentType,
        permissionMode: state.permissionMode,
        modelMode: state.modelMode,
        sessionType: state.sessionType,
    };
    persistTimer = setTimeout(() => {
        persistTimer = null;
        pendingInteractionPersist = InteractionManager.runAfterInteractions(() => {
            pendingInteractionPersist = null;
            persist(snapshot);
        });
    }, delayMs);
}

const initial = loadNewSessionDraft();

const selectNewSessionDraftValues = (state: NewSessionDraftState): NewSessionDraftValues => ({
    selectedMachineId: state.selectedMachineId,
    selectedPath: state.selectedPath,
    agentType: state.agentType,
    permissionMode: state.permissionMode,
    modelMode: state.modelMode,
});

const selectNewSessionDraftActions = (state: NewSessionDraftState): NewSessionDraftActions => ({
    setInput: state.setInput,
    setMachineId: state.setMachineId,
    setPath: state.setPath,
    setAgentType: state.setAgentType,
    setPermissionMode: state.setPermissionMode,
    setModelMode: state.setModelMode,
    setSessionType: state.setSessionType,
});

const selectNewSessionDraftInput = (state: NewSessionDraftState): NewSessionDraftInput => ({
    input: state.input,
    setInput: state.setInput,
});

export const useNewSessionDraft = create<NewSessionDraftState>()((set, get) => ({
    input: initial?.input ?? '',
    selectedMachineId: initial?.selectedMachineId ?? null,
    selectedPath: initial?.selectedPath ?? null,
    agentType: initial?.agentType ?? 'claude',
    permissionMode: initial?.permissionMode ?? 'default',
    modelMode: initial?.modelMode ?? 'default',
    sessionType: initial?.sessionType ?? 'simple',

    setInput: (input) => {
        if (get().input === input) {
            return;
        }
        set({ input });
        schedulePersist(get(), INPUT_PERSIST_DEBOUNCE_MS);
    },
    setMachineId: (id) => {
        if (get().selectedMachineId === id && get().selectedPath === null) {
            return;
        }
        set({ selectedMachineId: id, selectedPath: null });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
    setPath: (path) => {
        if (get().selectedPath === path) {
            return;
        }
        set({ selectedPath: path });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
    setAgentType: (agent) => {
        if (get().agentType === agent) {
            return;
        }
        set({ agentType: agent });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
    setPermissionMode: (mode) => {
        if (get().permissionMode === mode) {
            return;
        }
        set({ permissionMode: mode });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
    setModelMode: (mode) => {
        if (get().modelMode === mode) {
            return;
        }
        set({ modelMode: mode });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
    setSessionType: (type) => {
        if (get().sessionType === type) {
            return;
        }
        set({ sessionType: type });
        schedulePersist(get(), CONFIG_PERSIST_DEBOUNCE_MS);
    },
}));

export function useNewSessionDraftValues(): NewSessionDraftValues {
    return useNewSessionDraft(useShallow(selectNewSessionDraftValues));
}

export function useNewSessionDraftActions(): NewSessionDraftActions {
    return useNewSessionDraft(useShallow(selectNewSessionDraftActions));
}

export function useNewSessionDraftInput(): NewSessionDraftInput {
    return useNewSessionDraft(useShallow(selectNewSessionDraftInput));
}
