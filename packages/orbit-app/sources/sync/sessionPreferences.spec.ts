import { describe, expect, it } from 'vitest';

import type { Session } from './storageTypes';
import {
    buildPersistedSessionDrafts,
    buildPersistedSessionPermissionModes,
    hydrateSessionPreferences,
    normalizeSessionDraft,
} from './sessionPreferences';

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'host',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        draft: null,
        permissionMode: 'default',
        ...overrides,
    };
}

describe('sessionPreferences', () => {
    it('normalizes blank drafts to null', () => {
        expect(normalizeSessionDraft('')).toBeNull();
        expect(normalizeSessionDraft('   ')).toBeNull();
        expect(normalizeSessionDraft(' keep ')).toBe(' keep ');
    });

    it('hydrates drafts and permission modes with precedence existing > saved > server > sandbox default', () => {
        const existingSession = createSession({
            draft: 'existing draft',
            permissionMode: 'plan',
        });
        const serverSession = createSession({
            draft: 'server draft',
            permissionMode: 'read-only',
            metadata: {
                path: '/tmp/project',
                host: 'host',
                sandbox: { enabled: true },
            },
        });

        expect(hydrateSessionPreferences({
            session: serverSession,
            existingSession,
            savedDraft: 'saved draft',
            savedPermissionMode: 'yolo',
        })).toEqual({
            draft: 'existing draft',
            permissionMode: 'plan',
        });

        expect(hydrateSessionPreferences({
            session: serverSession,
            savedDraft: 'saved draft',
            savedPermissionMode: 'yolo',
        })).toEqual({
            draft: 'saved draft',
            permissionMode: 'yolo',
        });

        expect(hydrateSessionPreferences({
            session: serverSession,
        })).toEqual({
            draft: 'server draft',
            permissionMode: 'read-only',
        });

        expect(hydrateSessionPreferences({
            session: createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'host',
                    sandbox: { enabled: true },
                },
                permissionMode: 'default',
            }),
        })).toEqual({
            draft: null,
            permissionMode: 'bypassPermissions',
        });
    });

    it('persists only non-empty drafts and non-default permission modes', () => {
        expect(buildPersistedSessionDrafts({
            keep: { draft: 'draft' },
            blank: { draft: '   ' },
            gone: { draft: null },
        })).toEqual({
            keep: 'draft',
        });

        expect(buildPersistedSessionPermissionModes({
            keep: { permissionMode: 'plan' },
            enterPlanMode: { permissionMode: 'plan' },
            defaultMode: { permissionMode: 'default' },
            missing: { permissionMode: null },
        })).toEqual({
            keep: 'plan',
            enterPlanMode: 'plan',
        });
    });
});
