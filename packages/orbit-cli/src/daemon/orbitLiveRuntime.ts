import { basename } from 'path';

import type { LiveMirrorRuntimeDescriptor, LiveMirrorTool } from '@orbit/wire';

import type { Metadata } from '@/api/types';

import type { TrackedSession } from './types';

export function buildOrbitLiveRuntimeId(sessionId: string): string {
  return `orbit-runtime:${sessionId}`;
}

function resolveRuntimeTool(metadata: Metadata): LiveMirrorTool | null {
  const flavor = metadata.flavor;
  if (flavor === 'claude' || flavor === 'codex' || flavor === 'gemini' || flavor === 'openclaw') {
    return flavor;
  }

  if (metadata.codexThreadId) {
    return 'codex';
  }

  if (metadata.geminiSessionId) {
    return 'gemini';
  }

  if (metadata.claudeSessionId) {
    return 'claude';
  }

  return null;
}

function resolveRuntimeTitle(metadata: Metadata): string {
  const summaryTitle = metadata.summary?.text?.trim();
  if (summaryTitle) {
    return summaryTitle;
  }

  const sessionName = metadata.name?.trim();
  if (sessionName) {
    return sessionName;
  }

  return basename(metadata.projectRoot ?? metadata.path) || metadata.path;
}

export function buildOrbitLiveRuntimeDescriptor(
  trackedSession: TrackedSession,
  machineId: string,
): LiveMirrorRuntimeDescriptor | null {
  if (!trackedSession.orbitSessionId || !trackedSession.tmuxSessionId || !trackedSession.orbitSessionMetadataFromLocalWebhook) {
    return null;
  }

  const metadata = trackedSession.orbitSessionMetadataFromLocalWebhook;
  const tool = resolveRuntimeTool(metadata);
  if (!tool) {
    return null;
  }

  return {
    runtimeId: buildOrbitLiveRuntimeId(trackedSession.orbitSessionId),
    sessionId: trackedSession.orbitSessionId,
    machineId,
    tool,
    backendId: trackedSession.tmuxSessionId,
    backend: 'tmux',
    cwd: metadata.path,
    title: resolveRuntimeTitle(metadata),
    controlMode: 'viewer',
    status: metadata.lifecycleState === 'archived' ? 'stopped' : 'running',
    seq: 0,
    updatedAt: Date.now(),
  };
}

export function buildOrbitLiveSnapshot(paneText: string): string {
  return paneText.replace(/\r\n/g, '\n').trimEnd();
}
