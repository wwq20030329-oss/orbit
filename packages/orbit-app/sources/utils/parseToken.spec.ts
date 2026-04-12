import { describe, expect, it } from 'vitest';
import { encodeBase64Text } from '@/encryption/base64';
import { parseToken } from './parseToken';

describe('parseToken', () => {
    it('reads the user claim from base64url encoded tokens', () => {
        const header = encodeBase64Text(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'base64url');
        const payload = encodeBase64Text(JSON.stringify({ user: 'user_123' }), 'base64url');
        const signature = encodeBase64Text('sig', 'base64url');

        expect(parseToken(`${header}.${payload}.${signature}`)).toBe('user_123');
    });

    it('still supports sub claims', () => {
        const header = encodeBase64Text(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }), 'base64url');
        const payload = encodeBase64Text(JSON.stringify({ sub: 'sub_456' }), 'base64url');
        const signature = encodeBase64Text('sig', 'base64url');

        expect(parseToken(`${header}.${payload}.${signature}`)).toBe('sub_456');
    });
});
