import os from 'node:os';

import type { LiveMirrorRuntimeDescriptor } from '@orbit/wire';

import type { Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import type { NativeCliHistoryEntry } from '@/history/nativeCliHistory';
import type { ReplayTextMessage } from '@/history/nativeCliHistoryReplay';
import { projectPath } from '@/projectPath';

import packageJson from '../../package.json';

export function getNativeLiveMirrorKey(entry: NativeCliHistoryEntry): string {
  return `${entry.tool}:${entry.backendId}`;
}

export function buildNativeLiveMirrorTag(entry: NativeCliHistoryEntry): string {
  return `native-live:${getNativeLiveMirrorKey(entry)}`;
}

export function buildNativeLiveRuntimeId(entry: NativeCliHistoryEntry): string {
  return `native-runtime:${getNativeLiveMirrorKey(entry)}`;
}

export function buildNativeLiveRuntimeDescriptor(
  entry: NativeCliHistoryEntry,
  machineId: string,
): LiveMirrorRuntimeDescriptor {
  return {
    runtimeId: buildNativeLiveRuntimeId(entry),
    sessionId: `native-session:${getNativeLiveMirrorKey(entry)}`,
    machineId,
    tool: entry.tool,
    backendId: entry.backendId,
    backend: 'pty',
    cwd: entry.workingDirectory,
    title: entry.title,
    controlMode: 'viewer',
    status: entry.isLive ? 'running' : 'idle',
    seq: 0,
    updatedAt: entry.updatedAt,
  };
}

export function applyRuntimeLivenessToNativeHistoryEntries(
  entries: NativeCliHistoryEntry[],
  runtimes: Array<Pick<LiveMirrorRuntimeDescriptor, 'tool' | 'backendId' | 'updatedAt' | 'status'>>,
): NativeCliHistoryEntry[] {
  const runtimeByKey = new Map<string, Pick<LiveMirrorRuntimeDescriptor, 'updatedAt' | 'status'>>();

  for (const runtime of runtimes) {
    runtimeByKey.set(`${runtime.tool}:${runtime.backendId}`, {
      updatedAt: runtime.updatedAt,
      status: runtime.status,
    });
  }

  return entries.map((entry) => {
    const runtime = runtimeByKey.get(`${entry.tool}:${entry.backendId}`);
    if (!runtime) {
      return entry;
    }

    return {
      ...entry,
      isLive: runtime.status === 'running',
      updatedAt: Math.max(entry.updatedAt, runtime.updatedAt),
    };
  });
}

export function buildNativeLiveSnapshot(messages: ReplayTextMessage[]): string {
  return messages
    .map(formatNativeLiveReplayMessage)
    .join('\n\n')
    .trim();
}

export function formatNativeLiveReplayMessage(message: ReplayTextMessage): string {
  const prefix = message.role === 'user' ? '$ ' : '';
  return `${prefix}${message.text}`.trim();
}

export function buildNativeLiveMirrorMetadata(
  entry: NativeCliHistoryEntry,
  machineId: string,
): Metadata {
  const metadata: Metadata = {
    path: entry.workingDirectory,
    host: os.hostname(),
    version: packageJson.version,
    os: os.platform(),
    machineId,
    homeDir: os.homedir(),
    orbitHomeDir: configuration.orbitHomeDir,
    orbitLibDir: projectPath(),
    orbitToolsDir: `${projectPath()}/tools/unpacked`,
    startedFromDaemon: true,
    hostPid: process.pid,
    startedBy: 'daemon',
    sessionRole: 'native-live-mirror',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    flavor: entry.tool,
    summary: {
      text: entry.summary ?? entry.title,
      updatedAt: Date.now(),
    },
  };

  if (entry.tool === 'claude') {
    metadata.claudeSessionId = entry.backendId;
  } else if (entry.tool === 'codex') {
    metadata.codexThreadId = entry.backendId;
  } else if (entry.tool === 'gemini') {
    metadata.geminiSessionId = entry.backendId;
  }

  return metadata;
}
