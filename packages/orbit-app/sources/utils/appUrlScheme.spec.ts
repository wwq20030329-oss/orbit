import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
    config: {
        urlScheme: 'orbit',
    },
}));

import {
    getTerminalAuthPayload,
    getTerminalAuthPrefixes,
    isTerminalAuthUrl,
} from '@/utils/appUrlScheme';

describe('appUrlScheme terminal auth helpers', () => {
    it('accepts both double-slash and triple-slash terminal auth URLs', () => {
        expect(getTerminalAuthPrefixes()).toContain('orbit://terminal?');
        expect(getTerminalAuthPrefixes()).toContain('orbit:///terminal?');
    });

    it('extracts the payload from legacy double-slash terminal auth URLs', () => {
        expect(getTerminalAuthPayload('orbit://terminal?abc123')).toBe('abc123');
    });

    it('extracts the payload from triple-slash terminal auth URLs', () => {
        expect(getTerminalAuthPayload('orbit:///terminal?abc123')).toBe('abc123');
    });

    it('decodes percent-encoded payloads from parsed URLs', () => {
        expect(getTerminalAuthPayload('orbit:///terminal?abc%2D123')).toBe('abc-123');
    });

    it('rejects unrelated URLs', () => {
        expect(isTerminalAuthUrl('https://example.com')).toBe(false);
        expect(getTerminalAuthPayload('orbit://account?abc123')).toBeNull();
    });
});
