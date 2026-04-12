import { describe, expect, it } from 'vitest';
import { resolveMessageModeMeta } from './messageMeta';

describe('resolveMessageModeMeta', () => {
    it('sends explicit permission and model keys', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'read-only',
            modelMode: 'gpt-5-high',
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'read-only',
            model: 'gpt-5-high',
        });
    });

    it('forces bypass permissions in sandbox when mode is default', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'default',
            modelMode: null,
            metadata: {
                sandbox: { enabled: true },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: null,
        });
    });

    it('keeps default permissions when sandbox is disabled', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: 'default',
            metadata: {
                sandbox: null,
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'default',
            model: null,
        });
    });

    it('maps legacy dontAsk mode to bypassPermissions', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'dontAsk',
            modelMode: 'default',
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: null,
        });
    });

    it('maps auto_edit mode to acceptEdits', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto_edit',
            modelMode: 'default',
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'acceptEdits',
            model: null,
        });
    });
});
