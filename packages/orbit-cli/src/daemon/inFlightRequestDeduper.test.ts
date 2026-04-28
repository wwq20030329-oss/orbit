import { describe, expect, it, vi } from 'vitest';

import { createInFlightRequestDeduper } from './inFlightRequestDeduper';

describe('createInFlightRequestDeduper', () => {
  it('reuses the same in-flight promise for the same key', async () => {
    const deduper = createInFlightRequestDeduper<number>();
    const factory = vi.fn(async () => {
      await Promise.resolve();
      return 42;
    });

    const first = deduper.run('same-key', factory);
    const second = deduper.run('same-key', factory);

    expect(first).toBe(second);
    await expect(first).resolves.toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('allows a new request after the previous one settles', async () => {
    const deduper = createInFlightRequestDeduper<number>();
    const factory = vi.fn(async () => 7);

    await expect(deduper.run('same-key', factory)).resolves.toBe(7);
    await expect(deduper.run('same-key', factory)).resolves.toBe(7);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
