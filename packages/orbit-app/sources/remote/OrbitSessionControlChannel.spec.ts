import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/ops', () => ({
    sessionAbort: vi.fn(() => Promise.resolve()),
    sessionAllow: vi.fn(() => Promise.resolve()),
    sessionDeny: vi.fn(() => Promise.resolve()),
}));

import { OrbitSessionControlChannel } from './OrbitSessionControlChannel';

describe('OrbitSessionControlChannel', () => {
    it('routes abort and permission decisions to session-scoped control dependencies', async () => {
        const abortSession = vi.fn(() => Promise.resolve());
        const allowPermission = vi.fn(() => Promise.resolve());
        const denyPermission = vi.fn(() => Promise.resolve());

        const controlChannel = new OrbitSessionControlChannel('session-7', {
            abortSession,
            allowPermission,
            denyPermission,
        });

        await controlChannel.abort();
        await controlChannel.allowPermission('perm-1', {
            mode: 'acceptEdits',
            allowedTools: ['Edit'],
        });
        await controlChannel.denyPermission('perm-2', {
            decision: 'abort',
        });

        expect(abortSession).toHaveBeenCalledWith('session-7');
        expect(allowPermission).toHaveBeenCalledWith('session-7', 'perm-1', 'acceptEdits', ['Edit'], undefined);
        expect(denyPermission).toHaveBeenCalledWith('session-7', 'perm-2', undefined, undefined, 'abort');
    });
});
