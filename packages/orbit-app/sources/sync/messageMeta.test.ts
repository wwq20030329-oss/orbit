import { describe, expect, it } from 'vitest';
import { resolveMessageModeMeta } from './messageMeta';

describe('resolveMessageModeMeta', () => {
    it('sends explicit permission and model keys', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'read-only',
            modelMode: 'gpt-5-high',
            effortLevel: 'high',
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'read-only',
            model: 'gpt-5-high',
            effortLevel: 'high',
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

    it('omits effort level when none is selected', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'default',
            modelMode: 'default',
            effortLevel: null,
            metadata: null,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'default',
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
            metadata: {
                flavor: 'claude',
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'dontAsk',
            model: null,
        });
    });

    it('keeps claude auto mode when the session flavor is claude', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto',
            modelMode: 'default',
            metadata: {
                flavor: 'claude',
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'auto',
            model: null,
        });
    });

    it('keeps gemini auto_edit mode when the session flavor is gemini', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto_edit',
            modelMode: 'default',
            metadata: {
                flavor: 'gemini',
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'auto_edit',
            model: null,
        });
    });
});
