type ExpoUpdatesLike = {
  isEnabled?: boolean;
  updateId?: string | null;
  runtimeVersion?: string | null;
  manifest?: unknown;
  releaseChannel?: string | null;
  channel?: string | null;
  isEmbeddedLaunch?: boolean;
  reloadAsync?: () => Promise<void>;
  checkForUpdateAsync?: () => Promise<any>;
  fetchUpdateAsync?: () => Promise<any>;
};

let cachedExpoUpdates: ExpoUpdatesLike | null | undefined;
let loggedUnavailable = false;

function logUnavailable(error: unknown) {
  if (loggedUnavailable) {
    return;
  }

  loggedUnavailable = true;
  console.warn(
    'expo-updates unavailable, falling back to embedded bundle only:',
    error instanceof Error ? error.message : String(error)
  );
}

export function getExpoUpdates(): ExpoUpdatesLike | null {
  if (cachedExpoUpdates !== undefined) {
    return cachedExpoUpdates;
  }

  try {
    // Load lazily so a broken native updates module cannot crash app startup.
    cachedExpoUpdates = require('expo-updates') as ExpoUpdatesLike;
  } catch (error) {
    cachedExpoUpdates = null;
    logUnavailable(error);
  }

  return cachedExpoUpdates;
}

export function getExpoUpdatesState() {
  const updates = getExpoUpdates();

  return {
    isEnabled: !!updates?.isEnabled,
    updateId: typeof updates?.updateId === 'string' ? updates.updateId : null,
    runtimeVersion: typeof updates?.runtimeVersion === 'string' ? updates.runtimeVersion : null,
    manifest: updates?.manifest ?? null,
    releaseChannel: typeof updates?.releaseChannel === 'string' ? updates.releaseChannel : null,
    channel: typeof updates?.channel === 'string' ? updates.channel : null,
    isEmbeddedLaunch: updates?.isEmbeddedLaunch ?? null,
  };
}

export async function reloadFromExpoUpdatesAsync() {
  const updates = getExpoUpdates();
  if (!updates?.reloadAsync) {
    throw new Error('expo-updates reloadAsync unavailable');
  }

  await updates.reloadAsync();
}

export async function checkForExpoUpdateAsync() {
  const updates = getExpoUpdates();
  if (!updates?.checkForUpdateAsync) {
    return { isAvailable: false as const };
  }

  return updates.checkForUpdateAsync();
}

export async function fetchExpoUpdateAsync() {
  const updates = getExpoUpdates();
  if (!updates?.fetchUpdateAsync) {
    return { isNew: false as const };
  }

  return updates.fetchUpdateAsync();
}
