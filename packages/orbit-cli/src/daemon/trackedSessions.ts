import type { NativeCliTool } from '@/history/nativeCliHistory';

import type { TrackedSession } from './types';

export type TrackedSessionEntry = {
  pid: number;
  session: TrackedSession;
};

function compareTrackedSessionEntries(
  left: TrackedSessionEntry,
  right: TrackedSessionEntry,
): number {
  const leftHasWebhook = !!left.session.orbitSessionMetadataFromLocalWebhook;
  const rightHasWebhook = !!right.session.orbitSessionMetadataFromLocalWebhook;
  if (leftHasWebhook !== rightHasWebhook) {
    return leftHasWebhook ? -1 : 1;
  }

  const leftHasOrbitSessionId = !!left.session.orbitSessionId;
  const rightHasOrbitSessionId = !!right.session.orbitSessionId;
  if (leftHasOrbitSessionId !== rightHasOrbitSessionId) {
    return leftHasOrbitSessionId ? -1 : 1;
  }

  return right.pid - left.pid;
}

export function findTrackedSessionsByOrbitSessionId(
  entries: Iterable<TrackedSessionEntry>,
  orbitSessionId: string,
): TrackedSessionEntry[] {
  return Array.from(entries)
    .filter((entry) => entry.session.orbitSessionId === orbitSessionId)
    .sort(compareTrackedSessionEntries);
}

export function findTrackedSessionsByNativeHistorySource(
  entries: Iterable<TrackedSessionEntry>,
  tool: NativeCliTool,
  backendId: string,
): TrackedSessionEntry[] {
  return Array.from(entries)
    .filter((entry) => (
      entry.session.orbitSessionMetadataFromLocalWebhook?.nativeHistorySourceTool === tool
      && entry.session.orbitSessionMetadataFromLocalWebhook?.nativeHistorySourceBackendId === backendId
    ))
    .sort(compareTrackedSessionEntries);
}

export function findTrackedSessionsForStopTarget(
  entries: Iterable<TrackedSessionEntry>,
  sessionId: string,
): TrackedSessionEntry[] {
  const pidMatch = sessionId.startsWith('PID-')
    ? Number.parseInt(sessionId.replace('PID-', ''), 10)
    : null;

  return Array.from(entries)
    .filter((entry) => (
      entry.session.orbitSessionId === sessionId
      || (pidMatch !== null && entry.pid === pidMatch)
    ))
    .sort(compareTrackedSessionEntries);
}
