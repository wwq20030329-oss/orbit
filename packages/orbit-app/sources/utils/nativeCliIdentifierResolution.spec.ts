import { describe, expect, it } from 'vitest';

import {
    buildNativeIdentifier,
    getInFlightNativeIdentifierResolution,
    parseNativeIdentifier,
    registerInFlightNativeIdentifierResolution,
} from './nativeCliIdentifierResolution';

describe('nativeCliIdentifierResolution', () => {
    it('builds and parses explicit native identifiers', () => {
        const identifier = buildNativeIdentifier('codex', 'thread-1');

        expect(identifier).toBe('codex:thread-1');
        expect(parseNativeIdentifier(identifier)).toEqual({
            tool: 'codex',
            backendId: 'thread-1',
        });
    });

    it('parses native-session route identifiers', () => {
        expect(parseNativeIdentifier('native-session:claude:session-1')).toEqual({
            tool: 'claude',
            backendId: 'session-1',
        });
    });

    it('tracks in-flight resolution promises across equivalent identifier forms', async () => {
        const promise = Promise.resolve('session-1');

        const trackedPromise = registerInFlightNativeIdentifierResolution({
            id: 'claude:session:session-1',
            tool: 'claude',
            backendId: 'session-1',
        }, promise);

        expect(getInFlightNativeIdentifierResolution('claude:session-1')).toBe(promise);
        expect(getInFlightNativeIdentifierResolution('native-session:claude:session-1')).toBe(promise);

        await trackedPromise;

        expect(getInFlightNativeIdentifierResolution('claude:session-1')).toBeNull();
    });
});
