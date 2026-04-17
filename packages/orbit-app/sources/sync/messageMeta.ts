import type { Session } from './storageTypes';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

type SessionMessagePermissionMode =
    | 'default'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'plan'
    | 'auto'
    | 'dontAsk'
    | 'auto_edit'
    | 'read-only'
    | 'safe-yolo'
    | 'yolo';

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export function resolveMessageModeMeta(
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'effortLevel' | 'metadata'>,
): { permissionMode: SessionMessagePermissionMode; model: string | null; effortLevel?: string } {
    const sandboxEnabled = isSandboxEnabled(session.metadata);
    const permissionMode = normalizePermissionMode(session.permissionMode, sandboxEnabled, session.metadata?.flavor);

    const modelMode = session.modelMode || 'default';
    const model = modelMode !== 'default' ? modelMode : null;

    const result: { permissionMode: SessionMessagePermissionMode; model: string | null; effortLevel?: string } = {
        permissionMode,
        model,
    };

    if (session.effortLevel) {
        result.effortLevel = session.effortLevel;
    }

    return result;
}

function normalizePermissionMode(
    permissionMode: PermissionModeKey | null | undefined,
    sandboxEnabled: boolean,
    flavor: string | null | undefined,
): SessionMessagePermissionMode {
    if (!permissionMode || permissionMode === 'default') {
        return sandboxEnabled ? 'bypassPermissions' : 'default';
    }

    switch (permissionMode) {
        case 'auto':
            return flavor === 'claude' ? 'auto' : (sandboxEnabled ? 'bypassPermissions' : 'default');
        case 'dontAsk':
            return flavor === 'claude' ? 'dontAsk' : 'bypassPermissions';
        case 'auto_edit':
            return flavor === 'gemini' ? 'auto_edit' : 'acceptEdits';
        case 'acceptEdits':
        case 'bypassPermissions':
        case 'plan':
        case 'read-only':
        case 'safe-yolo':
        case 'yolo':
            return permissionMode;
        default:
            return sandboxEnabled ? 'bypassPermissions' : 'default';
    }
}
