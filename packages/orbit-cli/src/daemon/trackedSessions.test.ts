import { describe, expect, it } from 'vitest';

import {
  findTrackedSessionsByNativeHistorySource,
  findTrackedSessionsByOrbitSessionId,
  findTrackedSessionsForStopTarget,
  type TrackedSessionEntry,
} from './trackedSessions';

function createEntry(
  pid: number,
  overrides?: Partial<TrackedSessionEntry['session']>,
): TrackedSessionEntry {
  return {
    pid,
    session: {
      startedBy: 'daemon',
      pid,
      ...overrides,
    },
  };
}

describe('tracked session helpers', () => {
  it('prefers the newest tracked session for the same Orbit session id', () => {
    const matches = findTrackedSessionsByOrbitSessionId([
      createEntry(100, { orbitSessionId: 'session-1' }),
      createEntry(200, { orbitSessionId: 'session-1' }),
      createEntry(300, { orbitSessionId: 'session-2' }),
    ], 'session-1');

    expect(matches.map((entry) => entry.pid)).toEqual([200, 100]);
  });

  it('prefers webhook-backed native history sessions over stale shell entries', () => {
    const matches = findTrackedSessionsByNativeHistorySource([
      createEntry(100, {
        orbitSessionId: 'wrapper-1',
      }),
      createEntry(200, {
        orbitSessionId: 'wrapper-1',
        orbitSessionMetadataFromLocalWebhook: {
          path: '/tmp/project',
          host: 'test-host',
          homeDir: '/Users/test',
          orbitHomeDir: '/Users/test/.orbit',
          orbitLibDir: '/tmp/orbit',
          orbitToolsDir: '/tmp/orbit/tools',
          nativeHistorySourceTool: 'claude',
          nativeHistorySourceBackendId: 'backend-1',
        },
      }),
      createEntry(300, {
        orbitSessionMetadataFromLocalWebhook: {
          path: '/tmp/project',
          host: 'test-host',
          homeDir: '/Users/test',
          orbitHomeDir: '/Users/test/.orbit',
          orbitLibDir: '/tmp/orbit',
          orbitToolsDir: '/tmp/orbit/tools',
          nativeHistorySourceTool: 'claude',
          nativeHistorySourceBackendId: 'backend-1',
        },
      }),
    ], 'claude', 'backend-1');

    expect(matches.map((entry) => entry.pid)).toEqual([200, 300]);
  });

  it('returns every tracked duplicate when stopping by Orbit session id', () => {
    const matches = findTrackedSessionsForStopTarget([
      createEntry(100, { orbitSessionId: 'session-1' }),
      createEntry(200, { orbitSessionId: 'session-1' }),
      createEntry(300, { orbitSessionId: 'session-2' }),
    ], 'session-1');

    expect(matches.map((entry) => entry.pid)).toEqual([200, 100]);
  });
});
