import { describe, expect, it, vi } from 'vitest';

import { waitForSessionWebhook } from './webhookAwaiter';
import { TrackedSession } from './types';

describe('waitForSessionWebhook', () => {
  it('cleans up awaiters and invokes timeout cleanup on timeout', async () => {
    vi.useFakeTimers();

    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();
    const onTimeout = vi.fn();

    const pending = waitForSessionWebhook({
      pid: 42,
      pidToAwaiter,
      timeoutMs: 1000,
      timeoutLabel: 'PID 42',
      onTimeout,
    });

    expect(pidToAwaiter.has(42)).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({
      type: 'error',
      errorMessage: 'Session webhook timeout for PID 42',
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(pidToAwaiter.has(42)).toBe(false);
    vi.useRealTimers();
  });

  it('resolves successfully when the webhook arrives', async () => {
    vi.useFakeTimers();

    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>();
    const pending = waitForSessionWebhook({
      pid: 7,
      pidToAwaiter,
      timeoutMs: 1000,
      timeoutLabel: 'PID 7',
      onTimeout: vi.fn(),
    });

    const awaiter = pidToAwaiter.get(7);
    expect(awaiter).toBeDefined();
    awaiter?.({
      startedBy: 'daemon',
      pid: 7,
      orbitSessionId: 'session-7',
    });

    await expect(pending).resolves.toEqual({
      type: 'success',
      sessionId: 'session-7',
    });
    vi.useRealTimers();
  });
});
