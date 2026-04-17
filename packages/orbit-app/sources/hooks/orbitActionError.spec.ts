import { describe, expect, it } from 'vitest';

import { OrbitError } from '@/utils/errors';

import { getOrbitActionErrorMessage } from './orbitActionError';

describe('getOrbitActionErrorMessage', () => {
  it('uses OrbitError messages directly', () => {
    expect(getOrbitActionErrorMessage(new OrbitError('Session restore failed', false))).toBe('Session restore failed');
  });

  it('uses standard Error messages directly', () => {
    expect(getOrbitActionErrorMessage(new Error('RPC timeout'))).toBe('RPC timeout');
  });

  it('uses string errors directly', () => {
    expect(getOrbitActionErrorMessage('machine offline')).toBe('machine offline');
  });

  it('normalizes raw RPC method-not-available errors into a clear resume message', () => {
    expect(getOrbitActionErrorMessage(new Error('rpcmethodnotavailable'))).toBe(
      'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.',
    );
    expect(getOrbitActionErrorMessage('RPC method not available')).toBe(
      'Native CLI resume is unavailable on this machine. Restart Orbit CLI on the computer and try again.',
    );
  });

  it('extracts message fields from plain objects', () => {
    expect(getOrbitActionErrorMessage({ message: 'native history unavailable' })).toBe('native history unavailable');
  });

  it('falls back to Unknown error for empty values', () => {
    expect(getOrbitActionErrorMessage({})).toBe('Unknown error');
  });
});
