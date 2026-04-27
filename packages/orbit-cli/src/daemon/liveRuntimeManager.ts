import { EventEmitter } from 'node:events';

import type {
  LiveMirrorAttachAccepted,
  LiveMirrorDetach,
  LiveMirrorFrame,
  LiveMirrorFrameKind,
  LiveMirrorRuntimeDescriptor,
  LiveMirrorRuntimeStatus,
} from '@orbit/wire';

type RegisterRuntimeOptions = Omit<LiveMirrorRuntimeDescriptor, 'seq' | 'updatedAt'>;

type RuntimeRecord = {
  descriptor: LiveMirrorRuntimeDescriptor;
  frames: LiveMirrorFrame[];
  latestSnapshot: LiveMirrorFrame | null;
};

export type LiveRuntimeManagerEvents = {
  frame: (frame: LiveMirrorFrame) => void;
  detach: (event: LiveMirrorDetach) => void;
};

export class LiveRuntimeManager extends EventEmitter {
  private readonly bufferSize: number;
  private readonly runtimes = new Map<string, RuntimeRecord>();

  constructor(options?: { bufferSize?: number }) {
    super();
    this.bufferSize = options?.bufferSize ?? 500;
  }

  registerRuntime(options: RegisterRuntimeOptions): LiveMirrorRuntimeDescriptor {
    const descriptor: LiveMirrorRuntimeDescriptor = {
      ...options,
      seq: 0,
      updatedAt: Date.now(),
    };

    this.runtimes.set(options.runtimeId, {
      descriptor,
      frames: [],
      latestSnapshot: null,
    });

    return descriptor;
  }

  getRuntime(runtimeId: string): LiveMirrorRuntimeDescriptor | null {
    return this.runtimes.get(runtimeId)?.descriptor ?? null;
  }

  listRuntimes(): LiveMirrorRuntimeDescriptor[] {
    return Array.from(this.runtimes.values()).map((runtime) => runtime.descriptor);
  }

  upsertRuntimeDescriptor(descriptor: LiveMirrorRuntimeDescriptor): LiveMirrorRuntimeDescriptor {
    const runtime = this.runtimes.get(descriptor.runtimeId);
    if (!runtime) {
      this.runtimes.set(descriptor.runtimeId, {
        descriptor,
        frames: [],
        latestSnapshot: null,
      });
      return descriptor;
    }

    runtime.descriptor = {
      ...runtime.descriptor,
      ...descriptor,
      seq: Math.max(runtime.descriptor.seq, descriptor.seq),
      updatedAt: Math.max(runtime.descriptor.updatedAt, descriptor.updatedAt),
    };
    this.runtimes.set(descriptor.runtimeId, runtime);
    return runtime.descriptor;
  }

  attachRuntime(runtimeId: string, afterSeq = 0): LiveMirrorAttachAccepted | null {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      return null;
    }

    const snapshot = runtime.latestSnapshot && runtime.latestSnapshot.seq > afterSeq
      ? runtime.latestSnapshot
      : runtime.latestSnapshot;

    return {
      runtime: runtime.descriptor,
      snapshot,
      backlog: runtime.frames.filter((frame) => frame.seq > afterSeq),
    };
  }

  appendFrame(
    runtimeId: string,
    kind: LiveMirrorFrameKind,
    data: string,
    ts = Date.now(),
  ): LiveMirrorFrame {
    const runtime = this.mustGetRuntime(runtimeId);
    const frame: LiveMirrorFrame = {
      runtimeId: runtime.descriptor.runtimeId,
      sessionId: runtime.descriptor.sessionId,
      machineId: runtime.descriptor.machineId,
      tool: runtime.descriptor.tool,
      backendId: runtime.descriptor.backendId,
      backend: runtime.descriptor.backend,
      seq: runtime.descriptor.seq + 1,
      ts,
      kind,
      data,
    };

    runtime.descriptor = {
      ...runtime.descriptor,
      seq: frame.seq,
      updatedAt: ts,
    };

    runtime.frames.push(frame);
    if (kind === 'snapshot') {
      runtime.latestSnapshot = frame;
    }
    while (runtime.frames.length > this.bufferSize) {
      runtime.frames.shift();
    }

    this.runtimes.set(runtimeId, runtime);
    this.emit('frame', frame);
    return frame;
  }

  updateRuntimeStatus(runtimeId: string, status: LiveMirrorRuntimeStatus, ts = Date.now()): LiveMirrorRuntimeDescriptor {
    const runtime = this.mustGetRuntime(runtimeId);
    runtime.descriptor = {
      ...runtime.descriptor,
      status,
      updatedAt: ts,
    };
    this.runtimes.set(runtimeId, runtime);
    return runtime.descriptor;
  }

  updateRuntimeSize(runtimeId: string, cols: number, rows: number, ts = Date.now()): LiveMirrorRuntimeDescriptor {
    const runtime = this.mustGetRuntime(runtimeId);
    runtime.descriptor = {
      ...runtime.descriptor,
      cols,
      rows,
      updatedAt: ts,
    };
    this.runtimes.set(runtimeId, runtime);
    return runtime.descriptor;
  }

  detachRuntime(
    runtimeId: string,
    reason: LiveMirrorDetach['reason'],
    message?: string,
  ): LiveMirrorDetach | null {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      return null;
    }

    this.runtimes.delete(runtimeId);

    const event: LiveMirrorDetach = {
      runtimeId: runtime.descriptor.runtimeId,
      sessionId: runtime.descriptor.sessionId,
      machineId: runtime.descriptor.machineId,
      reason,
      ...(message ? { message } : {}),
    };

    this.emit('detach', event);
    return event;
  }

  private mustGetRuntime(runtimeId: string): RuntimeRecord {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new Error(`Live runtime not found: ${runtimeId}`);
    }
    return runtime;
  }
}
