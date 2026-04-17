import { describe, expect, it, vi } from 'vitest';

import { createLiveMirrorClient } from './liveMirror';

describe('liveMirrorClient', () => {
    it('forwards attach/input/control events through the socket transport', () => {
        const handlers = new Map<string, (data: unknown) => void>();
        const send = vi.fn(() => true);
        const client = createLiveMirrorClient({
            send,
            onMessage: (event, handler) => {
                handlers.set(event, handler);
                return () => {
                    handlers.delete(event);
                };
            },
        });

        client.attach({
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            mode: 'viewer',
        });
        client.sendInput({
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            data: 'ls\n',
            encoding: 'utf8',
        });
        client.setControlMode({
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            mode: 'controller',
        });

        expect(send).toHaveBeenNthCalledWith(1, 'live-attach-request', {
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            mode: 'viewer',
        });
        expect(send).toHaveBeenNthCalledWith(2, 'live-input', {
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            data: 'ls\n',
            encoding: 'utf8',
        });
        expect(send).toHaveBeenNthCalledWith(3, 'live-control', {
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            mode: 'controller',
        });

        client.dispose();
        expect(handlers.size).toBe(0);
    });

    it('fans socket events back out to client listeners', () => {
        const handlers = new Map<string, (data: unknown) => void>();
        const client = createLiveMirrorClient({
            send: vi.fn(() => true),
            onMessage: (event, handler) => {
                handlers.set(event, handler);
                return () => {
                    handlers.delete(event);
                };
            },
        });

        const accepted = vi.fn();
        const frame = vi.fn();
        const detached = vi.fn();

        client.onAttachAccepted(accepted);
        client.onFrame(frame);
        client.onDetach(detached);

        handlers.get('live-attach-accepted')?.({
            runtime: {
                runtimeId: 'runtime-1',
                sessionId: 'session-1',
                machineId: 'machine-1',
                tool: 'codex',
                backendId: 'thread-1',
                backend: 'tmux',
                cwd: '/tmp/project',
                title: 'project',
                controlMode: 'viewer',
                status: 'running',
                seq: 2,
                updatedAt: 200,
            },
            snapshot: null,
            backlog: [],
        });
        handlers.get('live-frame')?.({
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            tool: 'codex',
            backendId: 'thread-1',
            backend: 'tmux',
            seq: 3,
            ts: 210,
            kind: 'output',
            data: 'hello',
        });
        handlers.get('live-detach')?.({
            runtimeId: 'runtime-1',
            sessionId: 'session-1',
            machineId: 'machine-1',
            reason: 'runtime-ended',
        });

        expect(accepted).toHaveBeenCalledTimes(1);
        expect(frame).toHaveBeenCalledWith(expect.objectContaining({ seq: 3, data: 'hello' }));
        expect(detached).toHaveBeenCalledWith(expect.objectContaining({ reason: 'runtime-ended' }));
    });
});
