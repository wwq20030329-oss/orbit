import type { AgentState } from '@/api/types';

export function withControlledByUser(
    agentState: AgentState | null | undefined,
    controlledByUser: boolean,
): AgentState {
    return {
        ...(agentState ?? {}),
        controlledByUser,
    };
}

export function withRemoteControl(
    agentState: AgentState | null | undefined,
): AgentState {
    return withControlledByUser(agentState, false);
}

export function withLocalControl(
    agentState: AgentState | null | undefined,
): AgentState {
    return withControlledByUser(agentState, true);
}
