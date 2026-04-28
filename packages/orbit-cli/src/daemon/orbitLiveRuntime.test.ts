import { describe, expect, it } from 'vitest';

import { buildOrbitLiveRuntimeDescriptor, buildOrbitLiveRuntimeId, buildOrbitLiveSnapshot } from './orbitLiveRuntime';
import type { TrackedSession } from './types';

describe('orbitLiveRuntime', () => {
  it('builds runtime descriptors for tmux-backed Orbit sessions', () => {
    const trackedSession: TrackedSession = {
      startedBy: 'daemon',
      pid: 123,
      orbitSessionId: 'session-123',
      tmuxSessionId: 'orbit:12.0',
      orbitSessionMetadataFromLocalWebhook: {
        path: '/tmp/project',
        host: 'host.local',
        homeDir: '/Users/test',
        orbitHomeDir: '/Users/test/.orbit',
        orbitLibDir: '/tmp/orbit',
        orbitToolsDir: '/tmp/orbit/tools',
        summary: {
          text: 'Ship live terminal',
          updatedAt: 1,
        },
        lifecycleState: 'running',
        flavor: 'codex',
        codexThreadId: 'thread-1',
      },
    };

    expect(buildOrbitLiveRuntimeId('session-123')).toBe('orbit-runtime:session-123');

    const descriptor = buildOrbitLiveRuntimeDescriptor(trackedSession, 'machine-1');
    expect(descriptor).toMatchObject({
      runtimeId: 'orbit-runtime:session-123',
      sessionId: 'session-123',
      machineId: 'machine-1',
      tool: 'codex',
      backendId: 'orbit:12.0',
      backend: 'tmux',
      cwd: '/tmp/project',
      title: 'Ship live terminal',
      controlMode: 'viewer',
      status: 'running',
    });
  });

  it('falls back to path-derived title and infers tool from backend ids', () => {
    const trackedSession: TrackedSession = {
      startedBy: 'daemon',
      pid: 456,
      orbitSessionId: 'session-456',
      tmuxSessionId: 'orbit:13.0',
      orbitSessionMetadataFromLocalWebhook: {
        path: '/tmp/my-project',
        host: 'host.local',
        homeDir: '/Users/test',
        orbitHomeDir: '/Users/test/.orbit',
        orbitLibDir: '/tmp/orbit',
        orbitToolsDir: '/tmp/orbit/tools',
        lifecycleState: 'running',
        claudeSessionId: 'claude-1',
      },
    };

    const descriptor = buildOrbitLiveRuntimeDescriptor(trackedSession, 'machine-2');
    expect(descriptor?.tool).toBe('claude');
    expect(descriptor?.title).toBe('my-project');
  });

  it('returns null for sessions without tmux or supported metadata', () => {
    const trackedSession: TrackedSession = {
      startedBy: 'daemon',
      pid: 789,
      orbitSessionId: 'session-789',
      orbitSessionMetadataFromLocalWebhook: {
        path: '/tmp/project',
        host: 'host.local',
        homeDir: '/Users/test',
        orbitHomeDir: '/Users/test/.orbit',
        orbitLibDir: '/tmp/orbit',
        orbitToolsDir: '/tmp/orbit/tools',
      },
    };

    expect(buildOrbitLiveRuntimeDescriptor(trackedSession, 'machine-3')).toBeNull();
  });

  it('normalizes tmux pane snapshots', () => {
    expect(buildOrbitLiveSnapshot('hello\r\nworld\r\n')).toBe('hello\nworld');
  });
});
