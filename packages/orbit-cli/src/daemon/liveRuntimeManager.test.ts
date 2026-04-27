import { describe, expect, it } from 'vitest';

import { LiveRuntimeManager } from './liveRuntimeManager';

describe('LiveRuntimeManager', () => {
  it('registers runtimes and returns attach payloads', () => {
    const manager = new LiveRuntimeManager();
    manager.registerRuntime({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      backend: 'tmux',
      cwd: '/tmp/project',
      title: 'project',
      controlMode: 'viewer',
      status: 'starting',
    });

    const attached = manager.attachRuntime('runtime-1');
    expect(attached?.runtime.runtimeId).toBe('runtime-1');
    expect(attached?.runtime.seq).toBe(0);
    expect(attached?.backlog).toEqual([]);
  });

  it('appends ordered frames and replays backlog after a seq', () => {
    const manager = new LiveRuntimeManager();
    manager.registerRuntime({
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
    });

    manager.appendFrame('runtime-1', 'snapshot', 'screen-0', 100);
    manager.appendFrame('runtime-1', 'output', 'hello', 110);
    manager.appendFrame('runtime-1', 'output', 'world', 120);

    const attached = manager.attachRuntime('runtime-1', 1);
    expect(attached?.snapshot?.data).toBe('screen-0');
    expect(attached?.backlog.map((frame) => frame.seq)).toEqual([2, 3]);
  });

  it('trims ring buffer while preserving latest snapshot', () => {
    const manager = new LiveRuntimeManager({ bufferSize: 2 });
    manager.registerRuntime({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'claude',
      backendId: 'claude-1',
      backend: 'tmux',
      cwd: '/tmp/project',
      title: 'project',
      controlMode: 'viewer',
      status: 'running',
    });

    manager.appendFrame('runtime-1', 'snapshot', 'screen-0', 100);
    manager.appendFrame('runtime-1', 'output', 'a', 110);
    manager.appendFrame('runtime-1', 'output', 'b', 120);

    const attached = manager.attachRuntime('runtime-1');
    expect(attached?.snapshot?.data).toBe('screen-0');
    expect(attached?.backlog.map((frame) => frame.data)).toEqual(['a', 'b']);
  });

  it('updates status and size in runtime descriptor', () => {
    const manager = new LiveRuntimeManager();
    manager.registerRuntime({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'gemini',
      backendId: 'gemini-1',
      backend: 'pty',
      cwd: '/tmp/project',
      title: 'project',
      controlMode: 'controller',
      status: 'starting',
    });

    manager.updateRuntimeStatus('runtime-1', 'waiting-approval', 200);
    const resized = manager.updateRuntimeSize('runtime-1', 120, 40, 210);

    expect(resized.status).toBe('waiting-approval');
    expect(resized.cols).toBe(120);
    expect(resized.rows).toBe(40);
    expect(resized.updatedAt).toBe(210);
  });

  it('upserts runtime descriptors without dropping buffered frames', () => {
    const manager = new LiveRuntimeManager();
    manager.registerRuntime({
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
    });

    manager.appendFrame('runtime-1', 'output', 'hello', 110);
    const updated = manager.upsertRuntimeDescriptor({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'thread-1',
      backend: 'tmux',
      cwd: '/tmp/renamed-project',
      title: 'renamed',
      controlMode: 'controller',
      status: 'idle',
      seq: 0,
      updatedAt: 120,
    });

    expect(updated.title).toBe('renamed');
    expect(updated.cwd).toBe('/tmp/renamed-project');
    expect(updated.controlMode).toBe('controller');
    expect(updated.seq).toBe(1);
    expect(manager.attachRuntime('runtime-1')?.backlog).toHaveLength(1);
  });

  it('detaches runtimes with a structured reason', () => {
    const manager = new LiveRuntimeManager();
    manager.registerRuntime({
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
    });

    const event = manager.detachRuntime('runtime-1', 'runtime-ended', 'done');
    expect(event).toEqual({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      machineId: 'machine-1',
      reason: 'runtime-ended',
      message: 'done',
    });
    expect(manager.getRuntime('runtime-1')).toBeNull();
  });
});
