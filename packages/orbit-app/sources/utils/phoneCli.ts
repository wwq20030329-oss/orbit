import { Ionicons } from '@expo/vector-icons';

import type { Session } from '@/sync/storageTypes';
import type { NewSessionAgentType } from '@/sync/persistence';

export type PhoneCliTool = NewSessionAgentType;

export const PHONE_CLI_TOOL_ORDER: PhoneCliTool[] = ['claude', 'codex', 'gemini', 'openclaw'];

export function getPhoneCliLabel(tool: PhoneCliTool): string {
    switch (tool) {
        case 'claude':
            return 'Claude';
        case 'codex':
            return 'Codex';
        case 'gemini':
            return 'Gemini';
        case 'openclaw':
            return 'OpenClaw';
    }
}

export function getPhoneCliIcon(tool: PhoneCliTool): keyof typeof Ionicons.glyphMap {
    switch (tool) {
        case 'claude':
            return 'sparkles-outline';
        case 'codex':
            return 'code-slash-outline';
        case 'gemini':
            return 'diamond-outline';
        case 'openclaw':
            return 'planet-outline';
    }
}

export function getSessionPhoneCli(session: Session): PhoneCliTool {
    if (session.metadata?.flavor === 'openclaw') {
        return 'openclaw';
    }
    if (session.metadata?.codexThreadId || session.metadata?.flavor === 'codex') {
        return 'codex';
    }
    if (session.metadata?.geminiSessionId || session.metadata?.flavor === 'gemini') {
        return 'gemini';
    }
    return 'claude';
}
