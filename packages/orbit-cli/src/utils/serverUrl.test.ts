import { describe, expect, it } from 'vitest';

import { canonicalizeOrbitServerUrl, DEFAULT_SERVER_URL, resolveOrbitServerUrl } from './serverUrl';

describe('serverUrl', () => {
  it('maps the legacy VPS url to the canonical Orbit API domain', () => {
    expect(canonicalizeOrbitServerUrl('http://192.227.228.53:3005')).toBe(DEFAULT_SERVER_URL);
    expect(canonicalizeOrbitServerUrl('http://192.227.228.53:3005/')).toBe(DEFAULT_SERVER_URL);
  });

  it('preserves custom non-legacy server urls', () => {
    expect(canonicalizeOrbitServerUrl('https://custom.example.com/')).toBe('https://custom.example.com');
  });

  it('falls back to the canonical default when no env override is provided', () => {
    expect(resolveOrbitServerUrl(undefined)).toBe(DEFAULT_SERVER_URL);
    expect(resolveOrbitServerUrl('')).toBe(DEFAULT_SERVER_URL);
  });
});
