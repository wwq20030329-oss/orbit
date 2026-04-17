// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildIosTransportSecurity } from '../../config/iosTransportSecurity.js';

describe('buildIosTransportSecurity', () => {
    it('adds explicit exception domains for insecure external dev servers', () => {
        expect(buildIosTransportSecurity({
            variant: 'development' as any,
            serverUrls: ['http://dev-api.2003383.xyz:3005', 'http://api.orbit.local:3005'],
        })).toEqual({
            NSAllowsLocalNetworking: true,
            NSExceptionDomains: {
                'dev-api.2003383.xyz': {
                    NSExceptionAllowsInsecureHTTPLoads: true,
                    NSIncludesSubdomains: true,
                },
                'api.orbit.local': {
                    NSExceptionAllowsInsecureHTTPLoads: true,
                    NSIncludesSubdomains: true,
                },
            },
        });
    });

    it('keeps local networking without adding exceptions for secure servers', () => {
        expect(buildIosTransportSecurity({
            variant: 'development' as any,
            serverUrls: ['https://api.orbit.engineering'],
        })).toEqual({
            NSAllowsLocalNetworking: true,
        });
    });

    it('does not expose insecure exceptions in production', () => {
        expect(buildIosTransportSecurity({
            variant: 'production' as any,
            serverUrls: ['http://dev-api.2003383.xyz:3005'],
        })).toEqual({
            NSAllowsLocalNetworking: true,
        });
    });
});
