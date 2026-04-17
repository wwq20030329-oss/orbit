import { SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { TrackedSession } from './types';

export function waitForSessionWebhook(opts: {
  pid: number;
  pidToAwaiter: Map<number, (session: TrackedSession) => void>;
  timeoutMs: number;
  timeoutLabel: string;
  onTimeout: () => void;
}): Promise<SpawnSessionResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      opts.pidToAwaiter.delete(opts.pid);
      opts.onTimeout();
      resolve({
        type: 'error',
        errorMessage: `Session webhook timeout for ${opts.timeoutLabel}`,
      });
    }, opts.timeoutMs);

    opts.pidToAwaiter.set(opts.pid, (completedSession) => {
      clearTimeout(timeout);
      resolve({
        type: 'success',
        sessionId: completedSession.orbitSessionId!,
      });
    });
  });
}
