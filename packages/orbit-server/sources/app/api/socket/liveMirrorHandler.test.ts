import { afterEach, describe, expect, it, vi } from "vitest";

const relayMock = vi.hoisted(() => ({
    registerRuntime: vi.fn(),
    updateRuntime: vi.fn(),
    appendFrame: vi.fn(),
    getAttachedSocketIds: vi.fn(() => []),
    detachRuntime: vi.fn(),
    attach: vi.fn(),
    hasAttachment: vi.fn(),
    canWriteToRuntime: vi.fn(),
    detachAttachment: vi.fn(),
}));

const eventRouterMock = vi.hoisted(() => ({
    getConnections: vi.fn(),
}));

vi.mock("@/app/live/liveMirrorRelay", () => ({
    liveMirrorRelay: relayMock,
}));

vi.mock("@/app/events/eventRouter", () => ({
    eventRouter: eventRouterMock,
}));

import type { ClientConnection } from "@/app/events/eventRouter";
import { liveMirrorHandler } from "./liveMirrorHandler";

type FakeSocketEventHandler = (payload: unknown) => void;
type EmittedEvent = {
    event: string;
    payload: unknown;
};

class FakeSocket {
    readonly id: string;
    readonly emitted: EmittedEvent[] = [];
    readonly handlers = new Map<string, FakeSocketEventHandler>();
    readonly nsp = {
        sockets: new Map<string, FakeSocket>(),
    };

    constructor(id: string) {
        this.id = id;
    }

    on(event: string, handler: FakeSocketEventHandler): this {
        this.handlers.set(event, handler);
        return this;
    }

    emit(event: string, payload: unknown): boolean {
        this.emitted.push({ event, payload });
        return true;
    }

    trigger(event: string, payload: unknown): void {
        const handler = this.handlers.get(event);
        if (!handler) {
            throw new Error(`Missing handler for ${event}`);
        }

        handler(payload);
    }
}

function buildUserConnection(socket: FakeSocket): ClientConnection {
    return {
        connectionType: "user-scoped",
        socket: socket as never,
        userId: "user-1",
    };
}

function buildMachineConnection(socket: FakeSocket): ClientConnection {
    return {
        connectionType: "machine-scoped",
        socket: socket as never,
        userId: "user-1",
        machineId: "machine-1",
    };
}

describe("liveMirrorHandler", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("does not forward attach-time resize when the attachment cannot write", () => {
        const clientSocket = new FakeSocket("client-socket");
        const machineSocket = new FakeSocket("machine-socket");
        eventRouterMock.getConnections.mockReturnValue(new Set([
            buildMachineConnection(machineSocket),
        ]));
        relayMock.attach.mockReturnValue({
            runtime: {
                runtimeId: "runtime-1",
                sessionId: "session-1",
                machineId: "machine-1",
                tool: "codex",
                backendId: "thread-1",
                backend: "tmux",
                cwd: "/tmp/project",
                title: "project",
                controlMode: "viewer",
                status: "running",
                seq: 0,
                updatedAt: 10,
            },
            snapshot: null,
            backlog: [],
            requestedAfterSeq: 0,
            replayFromSeq: 0,
            oldestAvailableSeq: 0,
            latestSeq: 0,
            replayStatus: "exact",
        });
        relayMock.canWriteToRuntime.mockReturnValue(false);

        liveMirrorHandler("user-1", clientSocket as never, buildUserConnection(clientSocket));

        clientSocket.trigger("live-attach-request", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "controller",
            cols: 120,
            rows: 40,
        });

        expect(relayMock.attach).toHaveBeenCalledTimes(1);
        expect(relayMock.canWriteToRuntime).toHaveBeenCalledWith("user-1", "client-socket", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "controller",
            cols: 120,
            rows: 40,
        });
        expect(machineSocket.emitted).toEqual([]);
        expect(clientSocket.emitted).toEqual([
            {
                event: "live-attach-accepted",
                payload: relayMock.attach.mock.results[0]?.value,
            },
        ]);
    });

    it("requires controller permissions for runtime resize events", () => {
        const clientSocket = new FakeSocket("client-socket");
        const machineSocket = new FakeSocket("machine-socket");
        eventRouterMock.getConnections.mockReturnValue(new Set([
            buildMachineConnection(machineSocket),
        ]));
        relayMock.canWriteToRuntime
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);

        liveMirrorHandler("user-1", clientSocket as never, buildUserConnection(clientSocket));

        const resizePayload = {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            cols: 100,
            rows: 30,
        };

        clientSocket.trigger("live-resize", resizePayload);
        clientSocket.trigger("live-resize", resizePayload);

        expect(relayMock.canWriteToRuntime).toHaveBeenNthCalledWith(1, "user-1", "client-socket", resizePayload);
        expect(relayMock.canWriteToRuntime).toHaveBeenNthCalledWith(2, "user-1", "client-socket", resizePayload);
        expect(machineSocket.emitted).toEqual([
            {
                event: "live-resize",
                payload: resizePayload,
            },
        ]);
    });
});
