import { describe, expect, it } from 'vitest';

import {
  LIVE_ACTIVITY_GRACE_MS,
  LIVE_MACHINE_GRACE_MS,
  NATIVE_DAEMON_SESSION_GRACE_MS,
  isMachinePresenceOnline,
  isRecentlyActive,
  isSessionPresenceOnline,
  isSessionLikelyOnline,
  resolveSessionPresence,
} from './presence';

describe('presence', () => {
  const now = 1_776_010_000_000;

  it('treats recent activity as online', () => {
    expect(isRecentlyActive(now - 5_000, now)).toBe(true);
    expect(isSessionPresenceOnline({ active: true, activeAt: now - 5_000 }, now)).toBe(true);
    expect(isMachinePresenceOnline({ active: true, activeAt: now - 5_000 }, now)).toBe(true);
    expect(resolveSessionPresence({ active: true, activeAt: now - 5_000 }, now)).toBe('online');
  });

  it('treats stale active timestamps as offline', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;
    const staleMachineAt = now - LIVE_MACHINE_GRACE_MS - 1;

    expect(isRecentlyActive(staleAt, now)).toBe(false);
    expect(isSessionPresenceOnline({ active: true, activeAt: staleAt }, now)).toBe(false);
    expect(isMachinePresenceOnline({ active: true, activeAt: staleMachineAt }, now)).toBe(false);
    expect(resolveSessionPresence({ active: true, activeAt: staleAt }, now)).toBe(staleAt);
  });

  it('treats inactive sessions as offline even with fresh timestamps', () => {
    const recentAt = now - 1_000;

    expect(isSessionPresenceOnline({ active: false, activeAt: recentAt }, now)).toBe(false);
    expect(isMachinePresenceOnline({ active: false, activeAt: recentAt }, now)).toBe(false);
    expect(resolveSessionPresence({ active: false, activeAt: recentAt }, now)).toBe(recentAt);
  });

  it('treats running sessions as online even with stale presence', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        metadata: {
          lifecycleState: 'running',
        },
      }, now),
    ).toBe(true);
  });

  it('treats native CLI sessions with stale presence as offline even when metadata says running', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        metadata: {
          lifecycleState: 'running',
          codexThreadId: 'thread-123',
        },
      }, now),
    ).toBe(false);
  });

  it('treats imported native-history wrappers with stale presence as offline even when metadata says running', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        metadata: {
          lifecycleState: 'running',
          nativeHistorySourceTool: 'codex',
          nativeHistorySourceBackendId: 'thread-123',
        },
      }, now),
    ).toBe(false);
  });

  it('treats recently resumed daemon native sessions as online during the warmup grace period', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        updatedAt: now - (NATIVE_DAEMON_SESSION_GRACE_MS - 1_000),
        metadata: {
          lifecycleState: 'running',
          claudeSessionId: 'session-123',
          startedBy: 'daemon',
          startedFromDaemon: true,
        },
      }, now),
    ).toBe(true);
  });

  it('does not trust persisted online presence for stale native sessions once activity and daemon warmup are gone', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        presence: 'online',
        updatedAt: now - NATIVE_DAEMON_SESSION_GRACE_MS - 1,
        metadata: {
          lifecycleState: 'running',
          claudeSessionId: 'session-123',
        },
      }, now),
    ).toBe(false);
  });

  it('treats sessions with an attached live runtime as online even when persisted presence is stale', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        liveRuntime: {
          status: 'connected',
        },
        metadata: {
          lifecycleState: 'running',
          nativeHistorySourceTool: 'claude',
          nativeHistorySourceBackendId: 'session-123',
        },
      }, now),
    ).toBe(true);
  });

  it('keeps non-native sessions online when storage already resolved their presence to online', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        presence: 'online',
        metadata: {
          lifecycleState: 'running',
        },
      }, now),
    ).toBe(true);
  });

  it('still treats native live mirror sessions as offline even if persisted presence says online', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        presence: 'online',
        liveRuntime: {
          status: 'connected',
        },
        metadata: {
          lifecycleState: 'running',
          sessionRole: 'native-live-mirror',
          claudeSessionId: 'session-123',
        },
      }, now),
    ).toBe(false);
  });

  it('does not trust persisted online presence for imported native-history wrappers', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        presence: 'online',
        metadata: {
          lifecycleState: 'running',
          nativeHistorySourceTool: 'claude',
          nativeHistorySourceBackendId: 'session-123',
        },
      }, now),
    ).toBe(false);
  });

  it('treats native CLI flavor sessions without a backend id as offline when only persisted online state remains', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        presence: 'online',
        metadata: {
          lifecycleState: 'running',
          flavor: 'claude',
        },
      }, now),
    ).toBe(false);
  });

  it('treats native CLI flavor sessions without a backend id as offline when only running metadata remains', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
        metadata: {
          lifecycleState: 'running',
          flavor: 'codex',
        },
      }, now),
    ).toBe(false);
  });

  it('treats stale sessions as offline when not running', () => {
    const staleAt = now - LIVE_ACTIVITY_GRACE_MS - 1;

    expect(
      isSessionLikelyOnline({
        active: false,
        activeAt: staleAt,
      }, now),
    ).toBe(false);
  });
});
