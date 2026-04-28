export type ShutdownRequestSource = 'orbit-app' | 'orbit-cli' | 'os-signal' | 'exception';

export interface ShutdownRequest {
  source: ShutdownRequestSource;
  errorMessage?: string;
}

export function createShutdownController(opts: {
  forceExitAfterMs: number;
  onForceExit: () => void | Promise<void>;
}) {
  let shutdownRequested = false;
  let forcedExitTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveShutdown: ((request: ShutdownRequest) => void) | null = null;

  const whenShutdownRequested = new Promise<ShutdownRequest>((resolve) => {
    resolveShutdown = resolve;
  });

  return {
    requestShutdown(request: ShutdownRequest): boolean {
      if (shutdownRequested) {
        return false;
      }

      shutdownRequested = true;
      forcedExitTimer = setTimeout(() => {
        void opts.onForceExit();
      }, opts.forceExitAfterMs);

      resolveShutdown?.(request);
      return true;
    },

    clearForcedExitTimer(): void {
      if (forcedExitTimer) {
        clearTimeout(forcedExitTimer);
        forcedExitTimer = null;
      }
    },

    whenShutdownRequested,
  };
}
