export function createInFlightRequestDeduper<T>() {
  const inFlight = new Map<string, Promise<T>>();

  return {
    run(key: string, factory: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }

      const promise = factory().finally(() => {
        if (inFlight.get(key) === promise) {
          inFlight.delete(key);
        }
      });

      inFlight.set(key, promise);
      return promise;
    },
  };
}
