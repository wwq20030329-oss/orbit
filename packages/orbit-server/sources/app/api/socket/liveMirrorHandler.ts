import {
    liveMirrorAttachRequestSchema,
    liveMirrorControlSchema,
    liveMirrorDetachSchema,
    liveMirrorFrameSchema,
    liveMirrorInputSchema,
    liveMirrorResizeSchema,
    liveMirrorRuntimeDescriptorSchema,
} from "@orbit/wire";
import { ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { liveMirrorRelay } from "@/app/live/liveMirrorRelay";
import { Socket } from "socket.io";

function emitToSocketIds(socket: Socket, socketIds: string[], eventName: string, payload: unknown): void {
    for (const socketId of socketIds) {
        socket.nsp.sockets.get(socketId)?.emit(eventName, payload);
    }
}

function emitToMachineConnections(userId: string, machineId: string, eventName: string, payload: unknown): void {
    const connections = eventRouter.getConnections(userId);
    if (!connections) {
        return;
    }

    for (const connection of connections) {
        if (connection.connectionType === "machine-scoped" && connection.machineId === machineId) {
            connection.socket.emit(eventName, payload);
        }
    }
}

function canWriteToRuntime(userId: string, socketId: string, runtimeRef: {
    runtimeId: string;
    sessionId: string;
    machineId: string;
}): boolean {
    return liveMirrorRelay.canWriteToRuntime(userId, socketId, runtimeRef);
}

export function liveMirrorHandler(userId: string, socket: Socket, connection: ClientConnection): void {
    socket.on("live-runtime-register", (data: unknown) => {
        if (connection.connectionType !== "machine-scoped") {
            return;
        }

        const parsed = liveMirrorRuntimeDescriptorSchema.safeParse(data);
        if (!parsed.success || parsed.data.machineId !== connection.machineId) {
            return;
        }

        liveMirrorRelay.registerRuntime(userId, parsed.data);
    });

    socket.on("live-runtime-update", (data: unknown) => {
        if (connection.connectionType !== "machine-scoped") {
            return;
        }

        const parsed = liveMirrorRuntimeDescriptorSchema.safeParse(data);
        if (!parsed.success || parsed.data.machineId !== connection.machineId) {
            return;
        }

        liveMirrorRelay.updateRuntime(userId, parsed.data);
    });

    socket.on("live-frame", (data: unknown) => {
        if (connection.connectionType !== "machine-scoped") {
            return;
        }

        const parsed = liveMirrorFrameSchema.safeParse(data);
        if (!parsed.success || parsed.data.machineId !== connection.machineId) {
            return;
        }

        const frame = liveMirrorRelay.appendFrame(userId, parsed.data);
        if (!frame) {
            return;
        }

        emitToSocketIds(socket, liveMirrorRelay.getAttachedSocketIds(userId, frame.runtimeId), "live-frame", frame);
    });

    socket.on("live-runtime-detach", (data: unknown) => {
        if (connection.connectionType !== "machine-scoped") {
            return;
        }

        const parsed = liveMirrorDetachSchema.safeParse(data);
        if (!parsed.success || parsed.data.machineId !== connection.machineId) {
            return;
        }

        const detached = liveMirrorRelay.detachRuntime(userId, parsed.data);
        if (!detached) {
            return;
        }

        emitToSocketIds(socket, detached.socketIds, "live-detach", detached.event);
    });

    socket.on("live-attach-request", (data: unknown) => {
        if (connection.connectionType === "machine-scoped") {
            return;
        }

        const parsed = liveMirrorAttachRequestSchema.safeParse(data);
        if (!parsed.success) {
            return;
        }

        const attached = liveMirrorRelay.attach(userId, socket.id, parsed.data);
        if (!attached) {
            socket.emit("live-detach", {
                runtimeId: parsed.data.runtimeId,
                sessionId: parsed.data.sessionId,
                machineId: parsed.data.machineId,
                reason: "error",
                message: "Live runtime not found",
            });
            return;
        }

        socket.emit("live-attach-accepted", attached);

        if (parsed.data.cols && parsed.data.rows && canWriteToRuntime(userId, socket.id, parsed.data)) {
            emitToMachineConnections(userId, parsed.data.machineId, "live-resize", {
                runtimeId: parsed.data.runtimeId,
                sessionId: parsed.data.sessionId,
                machineId: parsed.data.machineId,
                cols: parsed.data.cols,
                rows: parsed.data.rows,
            });
        }
    });

    socket.on("live-input", (data: unknown) => {
        if (connection.connectionType === "machine-scoped") {
            return;
        }

        const parsed = liveMirrorInputSchema.safeParse(data);
        if (!parsed.success) {
            return;
        }

        if (!canWriteToRuntime(userId, socket.id, parsed.data)) {
            return;
        }

        emitToMachineConnections(userId, parsed.data.machineId, "live-input", parsed.data);
    });

    socket.on("live-resize", (data: unknown) => {
        if (connection.connectionType === "machine-scoped") {
            return;
        }

        const parsed = liveMirrorResizeSchema.safeParse(data);
        if (!parsed.success) {
            return;
        }

        if (!canWriteToRuntime(userId, socket.id, parsed.data)) {
            return;
        }

        emitToMachineConnections(userId, parsed.data.machineId, "live-resize", parsed.data);
    });

    socket.on("live-control", (data: unknown) => {
        if (connection.connectionType === "machine-scoped") {
            return;
        }

        const parsed = liveMirrorControlSchema.safeParse(data);
        if (!parsed.success) {
            return;
        }

        if (!canWriteToRuntime(userId, socket.id, parsed.data)) {
            return;
        }

        emitToMachineConnections(userId, parsed.data.machineId, "live-control", parsed.data);
    });

    socket.on("live-detach", (data: unknown) => {
        if (connection.connectionType === "machine-scoped") {
            return;
        }

        const parsed = liveMirrorDetachSchema.pick({
            runtimeId: true,
            sessionId: true,
            machineId: true,
        }).safeParse(data);
        if (!parsed.success) {
            return;
        }

        liveMirrorRelay.detachAttachment(userId, parsed.data.runtimeId, socket.id);
    });
}
