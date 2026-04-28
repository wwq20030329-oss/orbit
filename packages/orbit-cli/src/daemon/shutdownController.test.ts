import { afterEach, describe, expect, it, vi } from 'vitest';

import { createShutdownController } from './shutdownController';

describe('createShutdownController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores duplicate shutdown requests', async () => {
    vi.useFakeTimers();

    const onForceExit = vi.fn();
    const controller = createShutdownController({
      forceExitAfterMs: 1000,
      onForceExit,
    });

    expect(controller.requestShutdown({ source: 'orbit-cli' })).toBe(true);
    expect(controller.requestShutdown({ source: 'os-signal' })).toBe(false);
    await expect(controller.whenShutdownRequested).resolves.toEqual({ source: 'orbit-cli' });

    vi.advanceTimersByTime(1000);
    expect(onForceExit).toHaveBeenCalledTimes(1);
  });

  it('clears the forced exit timer during graceful shutdown', () => {
    vi.useFakeTimers();

    const onForceExit = vi.fn();
    const controller = createShutdownController({
      forceExitAfterMs: 1000,
      onForceExit,
    });

    controller.requestShutdown({ source: 'orbit-app' });
    controller.clearForcedExitTimer();

    vi.advanceTimersByTime(1000);
    expect(onForceExit).not.toHaveBeenCalled();
  });
});
