const DEFAULT_SERVER_URL = 'https://api.2003383.xyz';

const LEGACY_SERVER_URLS = new Set([
  'http://192.227.228.53:3005',
  'http://192.227.228.53:3005/',
]);

export function canonicalizeOrbitServerUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  if (LEGACY_SERVER_URLS.has(trimmed)) {
    return DEFAULT_SERVER_URL;
  }

  return trimmed.replace(/\/+$/, '');
}

export function resolveOrbitServerUrl(url: string | null | undefined): string {
  return canonicalizeOrbitServerUrl(url) ?? DEFAULT_SERVER_URL;
}

export { DEFAULT_SERVER_URL };
