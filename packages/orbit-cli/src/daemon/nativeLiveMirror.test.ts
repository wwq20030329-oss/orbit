import { describe, expect, it } from 'vitest';

import {
  applyRuntimeLivenessToNativeHistoryEntries,
  buildNativeLiveMirrorMetadata,
  buildNativeLiveMirrorTag,
  buildNativeLiveRuntimeDescriptor,
  buildNativeLiveRuntimeId,
  buildNativeLiveSnapshot,
  formatNativeLiveReplayMessage,
  getNativeLiveMirrorKey,
} from './nativeLiveMirror';

describe('nativeLiveMirror', () => {
  it('builds stable keys and tags for mirrored live sessions', () => {
    const entry = {
      id: 'codex:thread-123',
      tool: 'codex' as const,
      backendId: 'thread-123',
      workingDirectory: '/tmp/project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 123,
      isLive: true,
    };

    expect(getNativeLiveMirrorKey(entry)).toBe('codex:thread-123');
    expect(buildNativeLiveMirrorTag(entry)).toBe('native-live:codex:thread-123');
  });

  it('stores provider-specific resume identifiers in mirrored metadata', () => {
    const codexEntry = {
      id: 'codex:thread-123',
      tool: 'codex' as const,
      backendId: 'thread-123',
      workingDirectory: '/tmp/project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 123,
      isLive: true,
    };

    const geminiEntry = {
      id: 'gemini:session-456',
      tool: 'gemini' as const,
      backendId: 'session-456',
      workingDirectory: '/tmp/project',
      title: 'Gemini live session',
      summary: 'Gemini summary',
      updatedAt: 123,
      isLive: true,
    };

    const codexMetadata = buildNativeLiveMirrorMetadata(codexEntry, 'machine-1');
    const geminiMetadata = buildNativeLiveMirrorMetadata(geminiEntry, 'machine-1');

    expect(codexMetadata.codexThreadId).toBe('thread-123');
    expect(codexMetadata.claudeSessionId).toBeUndefined();
    expect(codexMetadata.startedBy).toBe('daemon');
    expect(codexMetadata.sessionRole).toBe('native-live-mirror');
    expect(geminiMetadata.geminiSessionId).toBe('session-456');
    expect(geminiMetadata.summary?.text).toBe('Gemini summary');
  });

  it('builds stable runtime descriptors and terminal snapshots', () => {
    const entry = {
      id: 'claude:session-123',
      tool: 'claude' as const,
      backendId: 'session-123',
      workingDirectory: '/tmp/project',
      title: 'Claude live session',
      summary: 'Live summary',
      updatedAt: 456,
      isLive: true,
    };

    const descriptor = buildNativeLiveRuntimeDescriptor(entry, 'machine-1');
    expect(buildNativeLiveRuntimeId(entry)).toBe('native-runtime:claude:session-123');
    expect(descriptor.sessionId).toBe('native-session:claude:session-123');
    expect(descriptor.backend).toBe('pty');
    expect(descriptor.status).toBe('running');

    expect(formatNativeLiveReplayMessage({ role: 'user', text: 'ls', timestamp: 1 })).toBe('$ ls');
    expect(buildNativeLiveSnapshot([
      { role: 'user', text: 'ls', timestamp: 1 },
      { role: 'agent', text: 'file1\nfile2', timestamp: 2 },
    ])).toBe('$ ls\n\nfile1\nfile2');
  });

  it('overlays active live runtimes onto native history entries', () => {
    const entries = [
      {
        id: 'codex:thread-123',
        tool: 'codex' as const,
        backendId: 'thread-123',
        workingDirectory: '/tmp/project',
        title: 'Current rollout thread',
        summary: null,
        updatedAt: 100,
        isLive: false,
      },
      {
        id: 'claude:session-456',
        tool: 'claude' as const,
        backendId: 'session-456',
        workingDirectory: '/tmp/project',
        title: 'Old Claude session',
        summary: null,
        updatedAt: 200,
        isLive: false,
      },
    ];

    const updated = applyRuntimeLivenessToNativeHistoryEntries(entries, [
      {
        tool: 'codex',
        backendId: 'thread-123',
        updatedAt: 300,
        status: 'running',
      },
      {
        tool: 'claude',
        backendId: 'session-456',
        updatedAt: 150,
        status: 'idle',
      },
    ]);

    expect(updated[0]).toMatchObject({
      backendId: 'thread-123',
      isLive: true,
      updatedAt: 300,
    });
    expect(updated[1]).toMatchObject({
      backendId: 'session-456',
      isLive: false,
      updatedAt: 200,
    });
  });
});
