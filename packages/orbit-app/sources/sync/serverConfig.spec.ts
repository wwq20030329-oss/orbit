import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from './serverUrlNormalize';

describe('normalizeServerUrl', () => {
    it('rewrites nip.io IPv4 hosts to direct IPs for native runtime', () => {
        expect(normalizeServerUrl('http://192-227-228-53.nip.io:3005', true)).toBe('http://192.227.228.53:3005');
    });

    it('keeps nip.io hostnames on web runtime', () => {
        expect(normalizeServerUrl('http://192-227-228-53.nip.io:3005', false)).toBe('http://192-227-228-53.nip.io:3005');
    });

    it('leaves unrelated hosts untouched', () => {
        expect(normalizeServerUrl('https://api.cluster-fluster.com', true)).toBe('https://api.cluster-fluster.com');
        expect(normalizeServerUrl('http://api.orbit.local:3005', true)).toBe('http://api.orbit.local:3005');
    });
});
