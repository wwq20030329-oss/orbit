import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeBase64, decodeBase64Text, encodeBase64, encodeBase64Text } from './base64';

describe('base64 helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('atob', undefined);
        vi.stubGlobal('btoa', undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('encodes and decodes binary data without browser globals', () => {
        const input = new Uint8Array([25, 98, 84, 190, 50, 194, 51, 115]);

        const encoded = encodeBase64(input, 'base64url');

        expect(encoded).toEqual('GWJUvjLCM3M');
        expect(decodeBase64(encoded, 'base64url')).toEqual(input);
    });

    it('round-trips utf-8 text for navigation parameters without browser globals', () => {
        const input = '/tmp/项目/notes/hello world.tsx';

        const encoded = encodeBase64Text(input, 'base64url');

        expect(decodeBase64Text(encoded, 'base64url')).toEqual(input);
    });
});
