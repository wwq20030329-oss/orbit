import type { Session } from './storageTypes';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

type SessionMessagePermissionMode =
    | 'default'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'plan'
    | 'read-only'
    | 'safe-yolo'
    | 'yolo';

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export function resolveMessageModeMeta(
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'metadata'>,
): { permissionMode: SessionMessagePermissionMode; model: string | null } {
    const sandboxEnabled = isSandboxEnabled(session.metadata);
    const permissionMode = normalizePermissionMode(session.permissionMode, sandboxEnabled);

    const modelMode = session.modelMode || 'default';
    const model = modelMode !== 'default' ? modelMode : null;

    return {
        permissionMode,
        model,
    };
}

function normalizePermissionMode(
    permissionMode: PermissionModeKey | null | undefined,
    sandboxEnabled: boolean,
): SessionMessagePermissionMode {
    if (!permissionMode || permissionMode === 'default') {
        return sandboxEnabled ? 'bypassPermissions' : 'default';
    }

    switch (permissionMode) {
        case 'dontAsk':
            return 'bypassPermissions';
        case 'auto_edit':
            return 'acceptEdits';
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
