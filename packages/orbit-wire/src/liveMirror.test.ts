import { describe, expect, it } from 'vitest';

import {
  liveMirrorAttachAcceptedSchema,
  liveMirrorAttachRequestSchema,
  liveMirrorClientEventSchema,
  liveMirrorFrameSchema,
  liveMirrorRuntimeDescriptorSchema,
  liveMirrorServerEventSchema,
} from './liveMirror';

describe('live mirror wire protocol', () => {
  it('parses runtime descriptors', () => {
    const parsed = liveMirrorRuntimeDescriptorSchema.safeParse({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      backend: 'tmux',
      cwd: '/Users/wwq/Desktop/claudeapp',
      title: 'claudeapp',
      controlMode: 'viewer',
      status: 'running',
      seq: 12,
      cols: 120,
      rows: 36,
      updatedAt: 123456,
    });

    expect(parsed.success).toBe(true);
  });

  it('parses attach request and response payloads', () => {
    const request = liveMirrorAttachRequestSchema.safeParse({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      afterSeq: 50,
      cols: 100,
      rows: 30,
      mode: 'controller',
    });

    const accepted = liveMirrorAttachAcceptedSchema.safeParse({
      runtime: {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        machineId: 'machine-1',
        tool: 'codex',
        backendId: 'thread-1',
        backend: 'tmux',
        cwd: '/tmp',
        title: 'codex runtime',
        controlMode: 'controller',
        status: 'running',
        seq: 51,
        updatedAt: 123456,
      },
      snapshot: {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        machineId: 'machine-1',
        tool: 'codex',
        backendId: 'thread-1',
        backend: 'tmux',
        seq: 50,
        ts: 123450,
        kind: 'snapshot',
        data: '\u001b[2Jhello',
      },
      backlog: [],
      requestedAfterSeq: 50,
      replayFromSeq: 50,
      oldestAvailableSeq: 50,
      latestSeq: 51,
      replayStatus: 'exact',
    });

    expect(request.success).toBe(true);
    expect(accepted.success).toBe(true);
  });

  it('parses live frames', () => {
    const parsed = liveMirrorFrameSchema.safeParse({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'claude',
      backendId: 'claude-session-1',
      backend: 'tmux',
      seq: 7,
      ts: 999,
      kind: 'output',
      data: 'Running tests...',
    });

    expect(parsed.success).toBe(true);
  });

  it('parses server and client event envelopes', () => {
    const serverEvent = liveMirrorServerEventSchema.safeParse({
      type: 'live-frame',
      payload: {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        machineId: 'machine-1',
        tool: 'codex',
        backendId: 'thread-1',
        backend: 'tmux',
        seq: 2,
        ts: 100,
        kind: 'status',
        data: '{"status":"waiting-approval"}',
      },
    });

    const clientEvent = liveMirrorClientEventSchema.safeParse({
      type: 'live-input',
      payload: {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        machineId: 'machine-1',
        data: 'hello world\n',
      },
    });

    expect(serverEvent.success).toBe(true);
    expect(clientEvent.success).toBe(true);
  });

  it('rejects malformed live mirror payloads', () => {
    expect(liveMirrorFrameSchema.safeParse({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      backend: 'tmux',
      seq: -1,
      ts: 100,
      kind: 'output',
      data: 'x',
    }).success).toBe(false);

    expect(liveMirrorAttachRequestSchema.safeParse({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      mode: 'invalid',
    }).success).toBe(false);

    expect(liveMirrorAttachAcceptedSchema.safeParse({
      runtime: {
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        machineId: 'machine-1',
        tool: 'codex',
        backendId: 'thread-1',
        backend: 'tmux',
        cwd: '/tmp',
        title: 'codex runtime',
        controlMode: 'controller',
        status: 'running',
        seq: 51,
        updatedAt: 123456,
      },
      snapshot: null,
      backlog: [],
      replayStatus: 'unknown',
    }).success).toBe(false);
  });
});
