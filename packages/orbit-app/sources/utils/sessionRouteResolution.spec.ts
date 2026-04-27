import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolveCanonicalSessionId: vi.fn(),
  resolveExistingDisplaySessionId: vi.fn(),
  resolveExistingCanonicalSessionId: vi.fn(),
}));

vi.mock('@/utils/openNativeCliSession', () => ({
  resolveCanonicalSessionId: hoisted.resolveCanonicalSessionId,
  resolveExistingDisplaySessionId: hoisted.resolveExistingDisplaySessionId,
  resolveExistingCanonicalSessionId: hoisted.resolveExistingCanonicalSessionId,
}));

import {
  getInitialSessionRouteResolution,
  resolveSessionRoute,
} from './sessionRouteResolution';

describe('sessionRouteResolution', () => {
  beforeEach(() => {
    hoisted.resolveCanonicalSessionId.mockReset();
    hoisted.resolveExistingDisplaySessionId.mockReset();
    hoisted.resolveExistingCanonicalSessionId.mockReset();
    vi.useRealTimers();
  });

  it('returns the existing canonical session as the initial route state', () => {
    hoisted.resolveExistingCanonicalSessionId.mockReturnValue('session-1');
    hoisted.resolveExistingDisplaySessionId.mockReturnValue('session-1');

    expect(getInitialSessionRouteResolution('session-1')).toEqual({
      initialSessionId: 'session-1',
      displaySessionId: 'session-1',
      resolvedSessionId: 'session-1',
      shouldReplaceRoute: false,
    });
  });

  it('keeps the existing session when canonical resolution returns null', async () => {
    hoisted.resolveExistingCanonicalSessionId.mockReturnValue('session-1');
    hoisted.resolveExistingDisplaySessionId.mockReturnValue('session-1');
    hoisted.resolveCanonicalSessionId.mockResolvedValue(null);

    await expect(resolveSessionRoute('session-1')).resolves.toEqual({
      initialSessionId: 'session-1',
      displaySessionId: 'session-1',
      resolvedSessionId: 'session-1',
      shouldReplaceRoute: false,
    });
  });

  it('marks the route for replacement when canonical resolution returns a different session', async () => {
    hoisted.resolveExistingCanonicalSessionId.mockReturnValue(null);
    hoisted.resolveExistingDisplaySessionId.mockReturnValue(null);
    hoisted.resolveCanonicalSessionId.mockResolvedValue('session-2');

    await expect(resolveSessionRoute('session-1')).resolves.toEqual({
      initialSessionId: null,
      displaySessionId: null,
      resolvedSessionId: 'session-2',
      shouldReplaceRoute: true,
    });
  });

  it('keeps explicit native identifier routes unresolved until an interactive session is available', () => {
    hoisted.resolveExistingCanonicalSessionId.mockReturnValue(null);
    hoisted.resolveExistingDisplaySessionId.mockReturnValue('session-offline');

    expect(getInitialSessionRouteResolution('codex:thread-1')).toEqual({
      initialSessionId: null,
      displaySessionId: 'session-offline',
      resolvedSessionId: null,
      shouldReplaceRoute: false,
    });
  });

  it('falls back instead of hanging when canonical resolution never settles', async () => {
    vi.useFakeTimers();
    hoisted.resolveExistingCanonicalSessionId.mockReturnValue(null);
    hoisted.resolveExistingDisplaySessionId.mockReturnValue(null);
    hoisted.resolveCanonicalSessionId.mockImplementation(() => new Promise(() => {}));

    const resolutionPromise = resolveSessionRoute('session-1');

    await vi.advanceTimersByTimeAsync(2_000);

    await expect(resolutionPromise).resolves.toEqual({
      initialSessionId: null,
      displaySessionId: null,
      resolvedSessionId: null,
      shouldReplaceRoute: false,
    });
  });
});
