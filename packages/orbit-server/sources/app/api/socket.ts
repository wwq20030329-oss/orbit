import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { buildMachineActivityEphemeral, ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { Server, Socket } from "socket.io";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";
import { decrementWebSocketConnection, incrementWebSocketConnection, websocketEventsCounter } from "../monitoring/metrics2";
import { usageHandler } from "./socket/usageHandler";
import { rpcHandler } from "./socket/rpcHandler";
import { pingHandler } from "./socket/pingHandler";
import { sessionUpdateHandler } from "./socket/sessionUpdateHandler";
import { machineUpdateHandler } from "./socket/machineUpdateHandler";
import { artifactUpdateHandler } from "./socket/artifactUpdateHandler";
import { accessKeyHandler } from "./socket/accessKeyHandler";
import { liveMirrorHandler } from "./socket/liveMirrorHandler";
import { liveMirrorRelay } from "@/app/live/liveMirrorRelay";
import {
    MACHINE_OFFLINE_GRACE_MS,
    resolveLiveAttachmentRecoveryGraceMs,
    resolveMachineRuntimeDetachGraceMs,
    SOCKET_CONNECTION_STATE_RECOVERY_MS,
} from "@/app/live/recoveryWindows";

export function startSocket(app: Fastify) {
    const LIVE_ATTACHMENT_RECOVERY_GRACE_MS = resolveLiveAttachmentRecoveryGraceMs(SOCKET_CONNECTION_STATE_RECOVERY_MS);
    const MACHINE_RUNTIME_DETACH_GRACE_MS = resolveMachineRuntimeDetachGraceMs({
        machineOfflineGraceMs: MACHINE_OFFLINE_GRACE_MS,
        liveAttachmentRecoveryGraceMs: LIVE_ATTACHMENT_RECOVERY_GRACE_MS,
    });
    const io = new Server(app.server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["*"]
        },
        // Recover short disconnects in-memory so mobile clients can continue
        // without immediately falling back to full refresh / loading flows.
        connectionStateRecovery: {
            maxDisconnectionDuration: SOCKET_CONNECTION_STATE_RECOVERY_MS,
            skipMiddlewares: true,
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 45000,
        pingInterval: 15000,
        path: '/v1/updates',
        allowUpgrades: true,
        upgradeTimeout: 10000,
        connectTimeout: 20000,
        serveClient: false // Don't serve the client files
    });

    let rpcListeners = new Map<string, Map<string, Socket>>();
    const pendingMachineOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingMachineRuntimeDetachTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingLiveAttachmentDetachTimers = new Map<string, ReturnType<typeof setTimeout>>();
    io.on("connection", async (socket) => {
        log({ module: 'websocket' }, `New connection attempt from socket: ${socket.id}`);
        const token = socket.handshake.auth.token as string;
        const clientType = socket.handshake.auth.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;

        if (!token) {
            log({ module: 'websocket' }, `No token provided`);
            socket.emit('error', { message: 'Missing authentication token' });
            socket.disconnect();
            return;
        }

        // Validate session-scoped clients have sessionId
        if (clientType === 'session-scoped' && !sessionId) {
            log({ module: 'websocket' }, `Session-scoped client missing sessionId`);
            socket.emit('error', { message: 'Session ID required for session-scoped clients' });
            socket.disconnect();
            return;
        }

        // Validate machine-scoped clients have machineId
        if (clientType === 'machine-scoped' && !machineId) {
            log({ module: 'websocket' }, `Machine-scoped client missing machineId`);
            socket.emit('error', { message: 'Machine ID required for machine-scoped clients' });
            socket.disconnect();
            return;
        }

        const verified = await auth.verifyToken(token);
        if (!verified) {
            log({ module: 'websocket' }, `Invalid token provided`);
            socket.emit('error', { message: 'Invalid authentication token' });
            socket.disconnect();
            return;
        }

        const userId = verified.userId;
        log({ module: 'websocket' }, `Token verified: ${userId}, clientType: ${clientType || 'user-scoped'}, sessionId: ${sessionId || 'none'}, machineId: ${machineId || 'none'}, socketId: ${socket.id}`);

        const pendingAttachmentDetachTimer = pendingLiveAttachmentDetachTimers.get(socket.id);
        if (pendingAttachmentDetachTimer) {
            clearTimeout(pendingAttachmentDetachTimer);
            pendingLiveAttachmentDetachTimers.delete(socket.id);
        }

        // Store connection based on type
        const metadata = { clientType: clientType || 'user-scoped', sessionId, machineId };
        let connection: ClientConnection;
        if (metadata.clientType === 'session-scoped' && sessionId) {
            connection = {
                connectionType: 'session-scoped',
                socket,
                userId,
                sessionId
            };
        } else if (metadata.clientType === 'machine-scoped' && machineId) {
            connection = {
                connectionType: 'machine-scoped',
                socket,
                userId,
                machineId
            };
        } else {
            connection = {
                connectionType: 'user-scoped',
                socket,
                userId
            };
        }
        eventRouter.addConnection(userId, connection);
        incrementWebSocketConnection(connection.connectionType);

        // Broadcast daemon online status
        if (connection.connectionType === 'machine-scoped') {
            const machineConnectionKey = `${userId}:${machineId!}`;
            const pendingOfflineTimer = pendingMachineOfflineTimers.get(machineConnectionKey);
            if (pendingOfflineTimer) {
                clearTimeout(pendingOfflineTimer);
                pendingMachineOfflineTimers.delete(machineConnectionKey);
            }
            const pendingRuntimeDetachTimer = pendingMachineRuntimeDetachTimers.get(machineConnectionKey);
            if (pendingRuntimeDetachTimer) {
                clearTimeout(pendingRuntimeDetachTimer);
                pendingMachineRuntimeDetachTimers.delete(machineConnectionKey);
            }

            // Broadcast daemon online
            if (!pendingOfflineTimer) {
                const machineActivity = buildMachineActivityEphemeral(machineId!, true, Date.now());
                eventRouter.emitEphemeral({
                    userId,
                    payload: machineActivity,
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }
        }

        socket.on('disconnect', () => {
            websocketEventsCounter.inc({ event_type: 'disconnect' });

            const existingDetachTimer = pendingLiveAttachmentDetachTimers.get(socket.id);
            if (existingDetachTimer) {
                clearTimeout(existingDetachTimer);
            }
            pendingLiveAttachmentDetachTimers.set(socket.id, setTimeout(() => {
                pendingLiveAttachmentDetachTimers.delete(socket.id);
                liveMirrorRelay.detachSocket(socket.id);
            }, LIVE_ATTACHMENT_RECOVERY_GRACE_MS));

            // Cleanup connections
            eventRouter.removeConnection(userId, connection);
            decrementWebSocketConnection(connection.connectionType);

            log({ module: 'websocket' }, `User disconnected: ${userId}`);

            // Broadcast daemon offline status
            if (connection.connectionType === 'machine-scoped') {
                const machineConnectionKey = `${userId}:${connection.machineId}`;
                const existingTimer = pendingMachineOfflineTimers.get(machineConnectionKey);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }
                const existingRuntimeDetachTimer = pendingMachineRuntimeDetachTimers.get(machineConnectionKey);
                if (existingRuntimeDetachTimer) {
                    clearTimeout(existingRuntimeDetachTimer);
                }

                pendingMachineOfflineTimers.set(machineConnectionKey, setTimeout(() => {
                    pendingMachineOfflineTimers.delete(machineConnectionKey);

                    const machineActivity = buildMachineActivityEphemeral(connection.machineId, false, Date.now());
                    eventRouter.emitEphemeral({
                        userId,
                        payload: machineActivity,
                        recipientFilter: { type: 'user-scoped-only' }
                    });
                }, MACHINE_OFFLINE_GRACE_MS));
                pendingMachineRuntimeDetachTimers.set(machineConnectionKey, setTimeout(() => {
                    pendingMachineRuntimeDetachTimers.delete(machineConnectionKey);

                    const detachedRuntimes = liveMirrorRelay.detachMachineRuntimes(userId, connection.machineId, 'machine-offline');
                    for (const detached of detachedRuntimes) {
                        for (const attachedSocketId of detached.socketIds) {
                            io.to(attachedSocketId).emit('live-detach', detached.event);
                        }
                    }
                }, MACHINE_RUNTIME_DETACH_GRACE_MS));
            }
        });

        // Handlers
        let userRpcListeners = rpcListeners.get(userId);
        if (!userRpcListeners) {
            userRpcListeners = new Map<string, Socket>();
            rpcListeners.set(userId, userRpcListeners);
        }
        rpcHandler(userId, socket, userRpcListeners);
        usageHandler(userId, socket);
        sessionUpdateHandler(userId, socket, connection);
        pingHandler(socket);
        machineUpdateHandler(userId, socket);
        artifactUpdateHandler(userId, socket);
        accessKeyHandler(userId, socket);
        liveMirrorHandler(userId, socket, connection);

        // Ready
        log({ module: 'websocket' }, `User connected: ${userId}`);
    });

    onShutdown('api', async () => {
        for (const timer of pendingMachineOfflineTimers.values()) {
            clearTimeout(timer);
        }
        pendingMachineOfflineTimers.clear();
        for (const timer of pendingMachineRuntimeDetachTimers.values()) {
            clearTimeout(timer);
        }
        pendingMachineRuntimeDetachTimers.clear();
        for (const timer of pendingLiveAttachmentDetachTimers.values()) {
            clearTimeout(timer);
        }
        pendingLiveAttachmentDetachTimers.clear();
        await io.close();
    });
}
