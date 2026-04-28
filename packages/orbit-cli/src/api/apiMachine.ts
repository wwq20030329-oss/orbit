/**
 * WebSocket client for machine/daemon communication with Orbit server
 * Similar to ApiSessionClient but for machine-scoped connections
 */

import { io, Socket } from 'socket.io-client';
import { logger } from '@/ui/logger';
import { configuration } from '@/configuration';
import { MachineMetadata, DaemonState, Machine, Update, UpdateMachineBody } from './types';
import { registerCommonHandlers, SpawnSessionOptions, SpawnSessionResult } from '../modules/common/registerCommonHandlers';
import { encodeBase64, decodeBase64, encrypt, decrypt } from './encryption';
import { backoff } from '@/utils/time';
import { RpcHandlerManager } from './rpc/RpcHandlerManager';
import { detectCLIAvailability, CLIAvailability } from '@/utils/detectCLI';
import { detectResumeSupport, type ResumeSupport } from '@/resume/localOrbitAgentAuth';
import type { NativeCliHistoryEntry, NativeCliTool } from '@/history/nativeCliHistory';
import type {
    LiveMirrorControl,
    LiveMirrorDetach,
    LiveMirrorFrame,
    LiveMirrorInput,
    LiveMirrorResize,
    LiveMirrorRuntimeDescriptor,
} from '@orbit/wire';

interface ServerToDaemonEvents {
    update: (data: Update) => void;
    'rpc-request': (data: { method: string, params: string }, callback: (response: string) => void) => void;
    'rpc-registered': (data: { method: string }) => void;
    'rpc-unregistered': (data: { method: string }) => void;
    'rpc-error': (data: { type: string, error: string }) => void;
    'live-input': (payload: LiveMirrorInput) => void;
    'live-resize': (payload: LiveMirrorResize) => void;
    'live-control': (payload: LiveMirrorControl) => void;
    auth: (data: { success: boolean, user: string }) => void;
    error: (data: { message: string }) => void;
}

interface DaemonToServerEvents {
    'machine-alive': (data: {
        machineId: string;
        time: number;
    }) => void;

    'machine-update-metadata': (data: {
        machineId: string;
        metadata: string; // Encrypted MachineMetadata
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        metadata: string
    } | {
        result: 'success',
        version: number,
        metadata: string
    }) => void) => void;

    'machine-update-state': (data: {
        machineId: string;
        daemonState: string; // Encrypted DaemonState
        expectedVersion: number
    }, cb: (answer: {
        result: 'error'
    } | {
        result: 'version-mismatch'
        version: number,
        daemonState: string
    } | {
        result: 'success',
        version: number,
        daemonState: string
    }) => void) => void;

    'rpc-register': (data: { method: string }) => void;
    'rpc-unregister': (data: { method: string }) => void;
    'rpc-call': (data: { method: string, params: any }, callback: (response: {
        ok: boolean
        result?: any
        error?: string
    }) => void) => void;
    'live-runtime-register': (payload: LiveMirrorRuntimeDescriptor) => void;
    'live-runtime-update': (payload: LiveMirrorRuntimeDescriptor) => void;
    'live-frame': (payload: LiveMirrorFrame) => void;
    'live-runtime-detach': (payload: LiveMirrorDetach) => void;
}

type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
    resumeSession?: (sessionId: string) => Promise<SpawnSessionResult>;
    listNativeCliHistory: (limit?: number) => Promise<NativeCliHistoryEntry[]>;
    deleteNativeCliHistoryEntry: (params: {
        tool: NativeCliTool;
        backendId: string;
        workingDirectory?: string;
    }) => Promise<{ deletedCount: number; deletedPaths: string[] }>;
    resumeNativeCliHistorySession: (params: {
        tool: NativeCliTool;
        backendId: string;
        workingDirectory: string;
        title: string;
        summary?: string | null;
        updatedAt?: number | null;
    }) => Promise<SpawnSessionResult>;
    stopSession: (sessionId: string) => boolean;
    requestShutdown: () => void;
}

type LiveMirrorHandlers = {
    onInput?: (payload: LiveMirrorInput) => void | Promise<void>;
    onResize?: (payload: LiveMirrorResize) => void | Promise<void>;
    onControl?: (payload: LiveMirrorControl) => void | Promise<void>;
}

function isNativeCliTool(value: unknown): value is NativeCliTool {
    return value === 'claude' || value === 'codex' || value === 'gemini';
}

export class ApiMachineClient {
    private socket!: Socket<ServerToDaemonEvents, DaemonToServerEvents>;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private lastKnownCLIAvailability: CLIAvailability | null = null;
    private lastKnownResumeSupport: ResumeSupport | null = null;
    private rpcHandlerManager: RpcHandlerManager;
    private resumeSessionHandler: ((sessionId: string) => Promise<SpawnSessionResult>) | null = null;
    private liveInputHandler: LiveMirrorHandlers['onInput'] | null = null;
    private liveResizeHandler: LiveMirrorHandlers['onResize'] | null = null;
    private liveControlHandler: LiveMirrorHandlers['onControl'] | null = null;

    constructor(
        private token: string,
        private machine: Machine
    ) {
        // Initialize RPC handler manager
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.machine.id,
            encryptionKey: this.machine.encryptionKey,
            encryptionVariant: this.machine.encryptionVariant,
            logger: (msg, data) => logger.debug(msg, data)
        });

        registerCommonHandlers(this.rpcHandlerManager, process.cwd());
    }

    setLiveMirrorHandlers({
        onInput,
        onResize,
        onControl,
    }: LiveMirrorHandlers): void {
        this.liveInputHandler = onInput ?? null;
        this.liveResizeHandler = onResize ?? null;
        this.liveControlHandler = onControl ?? null;
    }

    setRPCHandlers({
        spawnSession,
        resumeSession,
        listNativeCliHistory,
        deleteNativeCliHistoryEntry,
        resumeNativeCliHistorySession,
        stopSession,
        requestShutdown
    }: MachineRpcHandlers) {
        this.resumeSessionHandler = resumeSession ?? null;

        // Register spawn session handler
        this.rpcHandlerManager.registerHandler('spawn-orbit-session', async (params: any) => {
            const { directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token } = params || {};
            logger.debug(`[API MACHINE] Spawning session with params: ${JSON.stringify(params)}`);

            if (!directory) {
                throw new Error('Directory is required');
            }

            const result = await spawnSession({ directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token });

            switch (result.type) {
                case 'success':
                    logger.debug(`[API MACHINE] Spawned session ${result.sessionId}`);
                    return { type: 'success', sessionId: result.sessionId };

                case 'requestToApproveDirectoryCreation':
                    logger.debug(`[API MACHINE] Requesting directory creation approval for: ${result.directory}`);
                    return { type: 'requestToApproveDirectoryCreation', directory: result.directory };

                case 'error':
                    throw new Error(result.errorMessage);
            }
        });

        this.syncResumeSessionRpcRegistration(detectResumeSupport().rpcAvailable);

        this.rpcHandlerManager.registerHandler('list-native-cli-history', async (params: any) => {
            const limit = typeof params?.limit === 'number' ? params.limit : undefined;
            return await listNativeCliHistory(limit);
        });

        this.rpcHandlerManager.registerHandler('delete-native-cli-history', async (params: any) => {
            const { tool, backendId, workingDirectory } = params || {};
            if (!isNativeCliTool(tool) || typeof backendId !== 'string') {
                throw new Error('tool and backendId are required');
            }

            return await deleteNativeCliHistoryEntry({
                tool,
                backendId,
                workingDirectory: typeof workingDirectory === 'string' ? workingDirectory : undefined,
            });
        });

        this.rpcHandlerManager.registerHandler('resume-native-cli-session', async (params: any) => {
            const { tool, backendId, workingDirectory, title, summary, updatedAt } = params || {};
            if (!isNativeCliTool(tool) || typeof backendId !== 'string' || typeof workingDirectory !== 'string' || typeof title !== 'string') {
                throw new Error('tool, backendId, workingDirectory, and title are required');
            }

            const result = await resumeNativeCliHistorySession({
                tool,
                backendId,
                workingDirectory,
                title,
                summary: typeof summary === 'string' ? summary : null,
                updatedAt: typeof updatedAt === 'number' ? updatedAt : null,
            });

            switch (result.type) {
                case 'success':
                    return { type: 'success', sessionId: result.sessionId };
                case 'requestToApproveDirectoryCreation':
                    return result;
                case 'error':
                    throw new Error(result.errorMessage);
            }
        });

        // Register stop session handler  
        this.rpcHandlerManager.registerHandler('stop-session', (params: any) => {
            const { sessionId } = params || {};

            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const success = stopSession(sessionId);
            if (!success) {
                throw new Error('Session not found or failed to stop');
            }

            logger.debug(`[API MACHINE] Stopped session ${sessionId}`);
            return { message: 'Session stopped' };
        });

        // Register stop daemon handler
        this.rpcHandlerManager.registerHandler('stop-daemon', () => {
            logger.debug('[API MACHINE] Received stop-daemon RPC request');

            // Trigger shutdown callback after a delay
            setTimeout(() => {
                logger.debug('[API MACHINE] Initiating daemon shutdown from RPC');
                requestShutdown();
            }, 100);

            return { message: 'Daemon stop request acknowledged, starting shutdown sequence...' };
        });
    }

    private syncResumeSessionRpcRegistration(rpcAvailable: boolean): void {
        const method = 'resume-orbit-session';

        if (rpcAvailable && this.resumeSessionHandler) {
            if (!this.rpcHandlerManager.hasHandler(method)) {
                this.rpcHandlerManager.registerHandler(method, async (params: any) => {
                    const { sessionId } = params || {};

                    if (!sessionId || typeof sessionId !== 'string') {
                        throw new Error('Session ID is required');
                    }

                    const handler = this.resumeSessionHandler;
                    if (!handler) {
                        throw new Error('Resume session handler not available');
                    }

                    const result = await handler(sessionId);
                    switch (result.type) {
                        case 'success':
                            return { type: 'success', sessionId: result.sessionId };
                        case 'requestToApproveDirectoryCreation':
                            return result;
                        case 'error':
                            throw new Error(result.errorMessage);
                    }
                });
            }
            return;
        }

        if (this.rpcHandlerManager.hasHandler(method)) {
            this.rpcHandlerManager.unregisterHandler(method);
        }
    }

    /**
     * Update machine metadata
     * Currently unused, changes from the mobile client are more likely
     * for example to set a custom name.
     */
    async updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.metadata);

            const answer = await this.socket.emitWithAck('machine-update-metadata', {
                machineId: this.machine.id,
                metadata: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.metadataVersion
            });

            if (answer.result === 'success') {
                this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                this.machine.metadataVersion = answer.version;
                logger.debug('[API MACHINE] Metadata updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.metadataVersion) {
                    this.machine.metadataVersion = answer.version;
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
                }
                throw new Error('Metadata version mismatch'); // Triggers retry
            }
        });
    }

    /**
     * Update daemon state (runtime info) - similar to session updateAgentState
     * Simplified without lock - relies on backoff for retry
     */
    async updateDaemonState(handler: (state: DaemonState | null) => DaemonState): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.daemonState);

            const answer = await this.socket.emitWithAck('machine-update-state', {
                machineId: this.machine.id,
                daemonState: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
                expectedVersion: this.machine.daemonStateVersion
            });

            if (answer.result === 'success') {
                this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                this.machine.daemonStateVersion = answer.version;
                logger.debug('[API MACHINE] Daemon state updated successfully');
            } else if (answer.result === 'version-mismatch') {
                if (answer.version > this.machine.daemonStateVersion) {
                    this.machine.daemonStateVersion = answer.version;
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
                }
                throw new Error('Daemon state version mismatch'); // Triggers retry
            }
        });
    }

    connect() {
        const serverUrl = configuration.serverUrl.replace(/^http/, 'ws');
        logger.debug(`[API MACHINE] Connecting to ${serverUrl}`);

        this.socket = io(serverUrl, {
            transports: ['websocket'],
            auth: {
                token: this.token,
                clientType: 'machine-scoped' as const,
                machineId: this.machine.id
            },
            path: '/v1/updates',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        this.socket.on('connect', () => {
            logger.debug('[API MACHINE] Connected to server');

            // Update daemon state to running
            // We need to override previous state because the daemon (this process)
            // has restarted with new PID & port
            this.updateDaemonState((state) => ({
                ...state,
                status: 'running',
                pid: process.pid,
                httpPort: this.machine.daemonState?.httpPort,
                startedAt: Date.now()
            }));


            // Register all handlers
            this.rpcHandlerManager.onSocketConnect(this.socket);
            this.syncResumeSessionRpcRegistration(detectResumeSupport().rpcAvailable);

            // Start keep-alive
            this.startKeepAlive();
        });

        this.socket.on('disconnect', () => {
            logger.debug('[API MACHINE] Disconnected from server');
            this.rpcHandlerManager.onSocketDisconnect();
            this.stopKeepAlive();
        });

        // Single consolidated RPC handler
        this.socket.on('rpc-request', async (data: { method: string, params: string }, callback: (response: string) => void) => {
            logger.debugLargeJson(`[API MACHINE] Received RPC request:`, data);
            callback(await this.rpcHandlerManager.handleRequest(data));
        });

        // Handle update events from server
        this.socket.on('update', (data: Update) => {
            // Machine clients should only care about machine updates
            if (data.body.t === 'update-machine' && (data.body as UpdateMachineBody).machineId === this.machine.id) {
                // Handle machine metadata or daemon state updates from other clients (e.g., mobile app)
                const update = data.body as UpdateMachineBody;

                if (update.metadata) {
                    logger.debug('[API MACHINE] Received external metadata update');
                    this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.metadata.value));
                    this.machine.metadataVersion = update.metadata.version;
                }

                if (update.daemonState) {
                    logger.debug('[API MACHINE] Received external daemon state update');
                    this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.daemonState.value));
                    this.machine.daemonStateVersion = update.daemonState.version;
                }
            } else {
                logger.debug(`[API MACHINE] Received unknown update type: ${(data.body as any).t}`);
            }
        });

        this.socket.on('live-input', (payload: LiveMirrorInput) => {
            logger.debugLargeJson('[API MACHINE] Received live input', payload);
            void Promise.resolve(this.liveInputHandler?.(payload)).catch((error) => {
                logger.debug('[API MACHINE] Live input handler failed:', error);
            });
        });

        this.socket.on('live-resize', (payload: LiveMirrorResize) => {
            logger.debugLargeJson('[API MACHINE] Received live resize', payload);
            void Promise.resolve(this.liveResizeHandler?.(payload)).catch((error) => {
                logger.debug('[API MACHINE] Live resize handler failed:', error);
            });
        });

        this.socket.on('live-control', (payload: LiveMirrorControl) => {
            logger.debugLargeJson('[API MACHINE] Received live control', payload);
            void Promise.resolve(this.liveControlHandler?.(payload)).catch((error) => {
                logger.debug('[API MACHINE] Live control handler failed:', error);
            });
        });

        this.socket.on('connect_error', (error) => {
            logger.debug(`[API MACHINE] Connection error: ${error.message}`);
        });

        this.socket.io.on('error', (error: any) => {
            logger.debug('[API MACHINE] Socket error:', error);
        });
    }

    private startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(() => {
            const payload = {
                machineId: this.machine.id,
                time: Date.now()
            };
            if (process.env.DEBUG) {
                logger.debugLargeJson(`[API MACHINE] Emitting machine-alive`, payload);
            }
            this.socket.emit('machine-alive', payload);

            // Re-detect CLI availability and push metadata update if changed
            const newAvailability = detectCLIAvailability();
            const prev = this.lastKnownCLIAvailability;
            const newResumeSupport = detectResumeSupport();
            const prevResume = this.lastKnownResumeSupport;
            const cliAvailabilityChanged = !prev || prev.claude !== newAvailability.claude || prev.codex !== newAvailability.codex || prev.gemini !== newAvailability.gemini || prev.openclaw !== newAvailability.openclaw;
            const resumeSupportChanged = !prevResume
                || prevResume.rpcAvailable !== newResumeSupport.rpcAvailable
                || prevResume.orbitAgentAuthenticated !== newResumeSupport.orbitAgentAuthenticated;

            this.syncResumeSessionRpcRegistration(newResumeSupport.rpcAvailable);

            if (cliAvailabilityChanged || resumeSupportChanged) {
                this.lastKnownCLIAvailability = newAvailability;
                this.lastKnownResumeSupport = newResumeSupport;
                this.updateMachineMetadata((metadata) => ({
                    ...(metadata || {} as any),
                    cliAvailability: newAvailability,
                    resumeSupport: newResumeSupport,
                })).catch((err) => {
                    logger.debug('[API MACHINE] Failed to update machine capabilities:', err);
                });
            }
        }, 20000);
        logger.debug('[API MACHINE] Keep-alive started (20s interval)');
    }

    private stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            logger.debug('[API MACHINE] Keep-alive stopped');
        }
    }

    shutdown() {
        logger.debug('[API MACHINE] Shutting down');
        this.stopKeepAlive();
        if (this.socket) {
            this.socket.close();
            logger.debug('[API MACHINE] Socket closed');
        }
    }

    registerLiveRuntime(runtime: LiveMirrorRuntimeDescriptor): void {
        logger.debugLargeJson('[API MACHINE] Registering live runtime', runtime);
        this.socket.emit('live-runtime-register', runtime);
    }

    updateLiveRuntime(runtime: LiveMirrorRuntimeDescriptor): void {
        logger.debugLargeJson('[API MACHINE] Updating live runtime', runtime);
        this.socket.emit('live-runtime-update', runtime);
    }

    emitLiveFrame(frame: LiveMirrorFrame): void {
        this.socket.emit('live-frame', frame);
    }

    detachLiveRuntime(event: LiveMirrorDetach): void {
        logger.debugLargeJson('[API MACHINE] Detaching live runtime', event);
        this.socket.emit('live-runtime-detach', event);
    }
}
