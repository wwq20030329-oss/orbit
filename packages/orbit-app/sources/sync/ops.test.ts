import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
    sessionRPC: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: {
        sessionRPC: hoisted.sessionRPC,
    },
}));

vi.mock('./sync', () => ({
    sync: {},
}));

import { sessionAbort, sessionAllow, sessionDeny } from './ops';

describe('session RPC disconnect handling', () => {
    beforeEach(() => {
        hoisted.sessionRPC.mockReset();
    });

    it('treats abort disconnects as a safe no-op', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        hoisted.sessionRPC.mockRejectedValueOnce(new Error('socket has been disconnected'));

        await expect(sessionAbort('session-1')).resolves.toBeUndefined();

        expect(hoisted.sessionRPC).toHaveBeenCalledWith(
            'session-1',
            'abort',
            expect.objectContaining({
                reason: expect.stringContaining('STOP'),
            }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            'Ignoring session abort RPC after socket disconnect',
            expect.objectContaining({
                sessionId: 'session-1',
                error: expect.any(Error),
            }),
        );

        warnSpy.mockRestore();
    });

    it('treats permission allow disconnects as a safe no-op', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        hoisted.sessionRPC.mockRejectedValueOnce(new Error('Socket not connected'));

        await expect(sessionAllow('session-2', 'perm-1')).resolves.toBeUndefined();

        expect(hoisted.sessionRPC).toHaveBeenCalledWith(
            'session-2',
            'permission',
            expect.objectContaining({
                id: 'perm-1',
                approved: true,
            }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            'Ignoring session allow RPC after socket disconnect',
            expect.objectContaining({
                sessionId: 'session-2',
                error: expect.any(Error),
            }),
        );

        warnSpy.mockRestore();
    });

    it('treats permission deny disconnects as a safe no-op', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        hoisted.sessionRPC.mockRejectedValueOnce(new Error('socket has been disconnected'));

        await expect(sessionDeny('session-3', 'perm-2')).resolves.toBeUndefined();

        expect(hoisted.sessionRPC).toHaveBeenCalledWith(
            'session-3',
            'permission',
            expect.objectContaining({
                id: 'perm-2',
                approved: false,
            }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
            'Ignoring session deny RPC after socket disconnect',
            expect.objectContaining({
                sessionId: 'session-3',
                error: expect.any(Error),
            }),
        );

        warnSpy.mockRestore();
    });

    it('still surfaces non-disconnect RPC errors', async () => {
        hoisted.sessionRPC.mockRejectedValueOnce(new Error('RPC call failed'));

        await expect(sessionAbort('session-4')).rejects.toThrow('RPC call failed');
    });
});
