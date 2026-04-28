import type { PermissionModeKey } from '@/components/PermissionModeSelector';

import type { Session } from './storageTypes';

type SessionPreferenceSnapshot = Pick<Session, 'draft' | 'permissionMode'>;

type HydrateSessionPreferencesArgs = {
    session: Pick<Session, 'draft' | 'permissionMode' | 'metadata'>;
    existingSession?: SessionPreferenceSnapshot | undefined;
    savedDraft?: string | null | undefined;
    savedPermissionMode?: string | null | undefined;
};

function isPersistedPermissionMode(mode: string | null | undefined): mode is PermissionModeKey {
    return !!mode && mode !== 'default';
}

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export function normalizeSessionDraft(draft: string | null | undefined): string | null {
    return draft?.trim() ? draft : null;
}

export function resolveSessionPermissionMode(args: HydrateSessionPreferencesArgs): PermissionModeKey {
    const { session, existingSession, savedPermissionMode } = args;
    const defaultPermissionMode: PermissionModeKey = isSandboxEnabled(session.metadata) ? 'bypassPermissions' : 'default';

    return existingSession?.permissionMode && existingSession.permissionMode !== 'default'
        ? existingSession.permissionMode
        : savedPermissionMode && savedPermissionMode !== 'default'
            ? savedPermissionMode
            : session.permissionMode && session.permissionMode !== 'default'
                ? session.permissionMode
                : defaultPermissionMode;
}

export function hydrateSessionPreferences(args: HydrateSessionPreferencesArgs): Pick<Session, 'draft' | 'permissionMode'> {
    const { session, existingSession, savedDraft } = args;

    return {
        draft: normalizeSessionDraft(existingSession?.draft) ?? normalizeSessionDraft(savedDraft) ?? normalizeSessionDraft(session.draft),
        permissionMode: resolveSessionPermissionMode(args),
    };
}

export function buildPersistedSessionDrafts(
    sessions: Record<string, Pick<Session, 'draft'>>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(sessions)
            .flatMap(([sessionId, session]) => {
                const draft = normalizeSessionDraft(session.draft);
                return draft ? [[sessionId, draft]] : [];
            }),
    );
}

export function buildPersistedSessionPermissionModes(
    sessions: Record<string, Pick<Session, 'permissionMode'>>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(sessions)
            .flatMap(([sessionId, session]) => (
                isPersistedPermissionMode(session.permissionMode)
                    ? [[sessionId, session.permissionMode]]
                    : []
            )),
    );
}
