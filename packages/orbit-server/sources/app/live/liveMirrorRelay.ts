import type {
    LiveMirrorAttachAccepted,
    LiveMirrorAttachRequest,
    LiveMirrorControlMode,
    LiveMirrorDetach,
    LiveMirrorFrame,
    LiveMirrorRuntimeDescriptor,
} from "@orbit/wire";

type AttachmentRecord = {
    mode: LiveMirrorControlMode;
};

type RuntimeRelayRecord = {
    descriptor: LiveMirrorRuntimeDescriptor;
    frames: LiveMirrorFrame[];
    latestSnapshot: LiveMirrorFrame | null;
    attachedSockets: Map<string, AttachmentRecord>;
};

type ReplayComputation = {
    snapshot: LiveMirrorFrame | null;
    backlog: LiveMirrorFrame[];
    replayFromSeq: number;
    oldestAvailableSeq: number;
    latestSeq: number;
    replayStatus: "exact" | "snapshot-rebased" | "truncated";
};

export type DetachedRuntime = {
    event: LiveMirrorDetach;
    socketIds: string[];
};

function resolveAttachmentMode(
    runtimeMode: LiveMirrorControlMode,
    requestedMode: LiveMirrorControlMode,
): LiveMirrorControlMode {
    if (runtimeMode !== "controller") {
        return "viewer";
    }

    return requestedMode;
}

function buildSocketRuntimeRef(userId: string, runtimeId: string): string {
    return `${userId}:${runtimeId}`;
}

function parseSocketRuntimeRef(value: string): { userId: string; runtimeId: string } | null {
    const separator = value.indexOf(":");
    if (separator <= 0 || separator === value.length - 1) {
        return null;
    }

    return {
        userId: value.slice(0, separator),
        runtimeId: value.slice(separator + 1),
    };
}

export class LiveMirrorRelay {
    private readonly bufferSize: number;
    private readonly runtimesByUser = new Map<string, Map<string, RuntimeRelayRecord>>();
    private readonly runtimeRefsBySocket = new Map<string, Set<string>>();

    constructor(options?: { bufferSize?: number }) {
        this.bufferSize = options?.bufferSize ?? 500;
    }

    registerRuntime(userId: string, descriptor: LiveMirrorRuntimeDescriptor): LiveMirrorRuntimeDescriptor {
        const userRuntimes = this.getOrCreateUserRuntimes(userId);
        const existing = userRuntimes.get(descriptor.runtimeId);
        const record: RuntimeRelayRecord = existing
            ? {
                ...existing,
                descriptor,
                attachedSockets: new Map(existing.attachedSockets),
            }
            : {
                descriptor,
                frames: [],
                latestSnapshot: null,
                attachedSockets: new Map(),
            };

        userRuntimes.set(descriptor.runtimeId, record);
        return record.descriptor;
    }

    updateRuntime(userId: string, descriptor: LiveMirrorRuntimeDescriptor): LiveMirrorRuntimeDescriptor {
        return this.registerRuntime(userId, descriptor);
    }

    getRuntime(userId: string, runtimeId: string): LiveMirrorRuntimeDescriptor | null {
        return this.runtimesByUser.get(userId)?.get(runtimeId)?.descriptor ?? null;
    }

    listRuntimesForMachine(userId: string, machineId: string): LiveMirrorRuntimeDescriptor[] {
        const userRuntimes = this.runtimesByUser.get(userId);
        if (!userRuntimes) {
            return [];
        }

        return Array.from(userRuntimes.values())
            .filter((runtime) => runtime.descriptor.machineId === machineId)
            .map((runtime) => runtime.descriptor);
    }

    attach(userId: string, socketId: string, request: LiveMirrorAttachRequest): LiveMirrorAttachAccepted | null {
        const runtime = this.runtimesByUser.get(userId)?.get(request.runtimeId);
        if (!runtime) {
            return null;
        }

        if (runtime.descriptor.sessionId !== request.sessionId || runtime.descriptor.machineId !== request.machineId) {
            return null;
        }

        runtime.attachedSockets.set(socketId, {
            mode: resolveAttachmentMode(runtime.descriptor.controlMode, request.mode),
        });
        this.addSocketRuntimeRef(socketId, userId, request.runtimeId);
        const afterSeq = request.afterSeq ?? 0;
        const replay = this.computeReplay(runtime, afterSeq);

        return {
            runtime: runtime.descriptor,
            snapshot: replay.snapshot,
            backlog: replay.backlog,
            requestedAfterSeq: afterSeq,
            replayFromSeq: replay.replayFromSeq,
            oldestAvailableSeq: replay.oldestAvailableSeq,
            latestSeq: replay.latestSeq,
            replayStatus: replay.replayStatus,
        };
    }

    appendFrame(userId: string, frame: LiveMirrorFrame): LiveMirrorFrame | null {
        const runtime = this.runtimesByUser.get(userId)?.get(frame.runtimeId);
        if (!runtime) {
            return null;
        }

        if (runtime.descriptor.sessionId !== frame.sessionId || runtime.descriptor.machineId !== frame.machineId) {
            return null;
        }

        if (frame.seq <= runtime.descriptor.seq) {
            return null;
        }

        runtime.frames.push(frame);
        if (frame.kind === "snapshot") {
            runtime.latestSnapshot = frame;
            runtime.frames = runtime.frames.filter((candidate) => candidate.seq >= frame.seq);
        }

        const trimmed = this.trimFrames(runtime.frames, runtime.latestSnapshot);
        runtime.frames = trimmed.frames;
        runtime.latestSnapshot = trimmed.latestSnapshot;

        runtime.descriptor = {
            ...runtime.descriptor,
            seq: Math.max(runtime.descriptor.seq, frame.seq),
            updatedAt: frame.ts,
        };

        return frame;
    }

    getAttachedSocketIds(userId: string, runtimeId: string): string[] {
        return Array.from(this.runtimesByUser.get(userId)?.get(runtimeId)?.attachedSockets.keys() ?? []);
    }

    hasAttachment(
        userId: string,
        socketId: string,
        runtimeRef: Pick<LiveMirrorAttachRequest, "runtimeId" | "sessionId" | "machineId">,
    ): boolean {
        const runtime = this.runtimesByUser.get(userId)?.get(runtimeRef.runtimeId);
        if (!runtime) {
            return false;
        }

        if (runtime.descriptor.sessionId !== runtimeRef.sessionId || runtime.descriptor.machineId !== runtimeRef.machineId) {
            return false;
        }

        return runtime.attachedSockets.has(socketId);
    }

    canWriteToRuntime(
        userId: string,
        socketId: string,
        runtimeRef: Pick<LiveMirrorAttachRequest, "runtimeId" | "sessionId" | "machineId">,
    ): boolean {
        const runtime = this.runtimesByUser.get(userId)?.get(runtimeRef.runtimeId);
        if (!runtime) {
            return false;
        }

        if (runtime.descriptor.sessionId !== runtimeRef.sessionId || runtime.descriptor.machineId !== runtimeRef.machineId) {
            return false;
        }

        return runtime.descriptor.controlMode === "controller"
            && runtime.attachedSockets.get(socketId)?.mode === "controller";
    }

    detachAttachment(userId: string, runtimeId: string, socketId: string): boolean {
        const runtime = this.runtimesByUser.get(userId)?.get(runtimeId);
        if (!runtime) {
            return false;
        }

        const removed = runtime.attachedSockets.delete(socketId);
        if (removed) {
            this.removeSocketRuntimeRef(socketId, userId, runtimeId);
        }
        return removed;
    }

    detachRuntime(userId: string, event: LiveMirrorDetach): DetachedRuntime | null {
        const userRuntimes = this.runtimesByUser.get(userId);
        const runtime = userRuntimes?.get(event.runtimeId);
        if (!runtime) {
            return null;
        }

        userRuntimes!.delete(event.runtimeId);
        if (userRuntimes!.size === 0) {
            this.runtimesByUser.delete(userId);
        }

        const socketIds = Array.from(runtime.attachedSockets.keys());
        for (const socketId of socketIds) {
            this.removeSocketRuntimeRef(socketId, userId, event.runtimeId);
        }

        return {
            event,
            socketIds,
        };
    }

    detachMachineRuntimes(
        userId: string,
        machineId: string,
        reason: LiveMirrorDetach["reason"],
        message?: string,
    ): DetachedRuntime[] {
        const runtimes = this.listRuntimesForMachine(userId, machineId);
        return runtimes
            .map((runtime) => this.detachRuntime(userId, {
                runtimeId: runtime.runtimeId,
                sessionId: runtime.sessionId,
                machineId: runtime.machineId,
                reason,
                ...(message ? { message } : {}),
            }))
            .filter((value): value is DetachedRuntime => value !== null);
    }

    detachSocket(socketId: string): void {
        const refs = this.runtimeRefsBySocket.get(socketId);
        if (!refs) {
            return;
        }

        for (const ref of refs) {
            const parsed = parseSocketRuntimeRef(ref);
            if (!parsed) {
                continue;
            }

            const runtime = this.runtimesByUser.get(parsed.userId)?.get(parsed.runtimeId);
            runtime?.attachedSockets.delete(socketId);
        }

        this.runtimeRefsBySocket.delete(socketId);
    }

    private getOrCreateUserRuntimes(userId: string): Map<string, RuntimeRelayRecord> {
        let userRuntimes = this.runtimesByUser.get(userId);
        if (!userRuntimes) {
            userRuntimes = new Map();
            this.runtimesByUser.set(userId, userRuntimes);
        }
        return userRuntimes;
    }

    private addSocketRuntimeRef(socketId: string, userId: string, runtimeId: string): void {
        let refs = this.runtimeRefsBySocket.get(socketId);
        if (!refs) {
            refs = new Set();
            this.runtimeRefsBySocket.set(socketId, refs);
        }
        refs.add(buildSocketRuntimeRef(userId, runtimeId));
    }

    private removeSocketRuntimeRef(socketId: string, userId: string, runtimeId: string): void {
        const refs = this.runtimeRefsBySocket.get(socketId);
        if (!refs) {
            return;
        }

        refs.delete(buildSocketRuntimeRef(userId, runtimeId));
        if (refs.size === 0) {
            this.runtimeRefsBySocket.delete(socketId);
        }
    }

    private trimFrames(
        frames: LiveMirrorFrame[],
        latestSnapshot: LiveMirrorFrame | null,
    ): { frames: LiveMirrorFrame[]; latestSnapshot: LiveMirrorFrame | null } {
        const nextFrames = [...frames];
        let nextSnapshot = latestSnapshot;

        while (nextFrames.length > this.bufferSize) {
            if (nextSnapshot) {
                const snapshotSeq = nextSnapshot.seq;
                const snapshotIndex = nextFrames.findIndex((frame) => frame.seq === snapshotSeq);
                if (snapshotIndex > 0) {
                    nextFrames.splice(0, 1);
                    continue;
                }
                if (snapshotIndex === 0 && nextFrames.length > 1) {
                    nextFrames.shift();
                    nextSnapshot = null;
                    continue;
                }
            }

            nextFrames.shift();
        }

        return {
            frames: nextFrames,
            latestSnapshot: nextSnapshot,
        };
    }

    private computeReplay(runtime: RuntimeRelayRecord, afterSeq: number): ReplayComputation {
        const latestSeq = Math.max(
            runtime.descriptor.seq,
            runtime.latestSnapshot?.seq ?? 0,
            runtime.frames.at(-1)?.seq ?? 0,
        );
        const oldestFrameSeq = runtime.frames[0]?.seq ?? latestSeq;
        const oldestAvailableSeq = runtime.latestSnapshot
            ? Math.min(runtime.latestSnapshot.seq, oldestFrameSeq)
            : oldestFrameSeq;

        const exactBacklog = runtime.frames.filter((frame) => frame.seq > afterSeq);
        const hasGap = latestSeq > afterSeq && oldestFrameSeq > afterSeq + 1;
        const snapshot = runtime.latestSnapshot && (runtime.latestSnapshot.seq > afterSeq || afterSeq === 0)
            ? runtime.latestSnapshot
            : null;

        if (snapshot) {
            const backlog = runtime.frames.filter((frame) => frame.seq > Math.max(afterSeq, snapshot.seq));
            return {
                snapshot,
                backlog,
                replayFromSeq: snapshot.seq,
                oldestAvailableSeq,
                latestSeq,
                replayStatus: snapshot.seq > afterSeq ? "snapshot-rebased" : "exact",
            };
        }

        return {
            snapshot: null,
            backlog: exactBacklog,
            replayFromSeq: exactBacklog[0]?.seq ?? latestSeq,
            oldestAvailableSeq,
            latestSeq,
            replayStatus: hasGap ? "truncated" : "exact",
        };
    }
}

export const liveMirrorRelay = new LiveMirrorRelay();
