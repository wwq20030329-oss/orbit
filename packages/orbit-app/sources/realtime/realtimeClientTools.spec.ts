import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendCurrentSessionMessage = vi.fn(() => Promise.resolve('session-1'));
const allowPermission = vi.fn(() => Promise.resolve());
const denyPermission = vi.fn(() => Promise.resolve());

vi.mock('@/remote/OrbitRemoteSessionManager', () => {
    return {
        OrbitRemoteSessionManager: vi.fn(() => ({
            sendCurrentSessionMessage,
            allowPermission,
            denyPermission,
        })),
    };
});

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: vi.fn(() => ({
            sessions: {
                'session-1': {
                    agentState: {
                        requests: {
                            'request-1': {},
                        },
                    },
                },
            },
        })),
    },
}));

vi.mock('@/track', () => ({
    trackVoicePermissionResponse: vi.fn(),
}));

vi.mock('./RealtimeSession', () => ({
    getVoiceSession: vi.fn(() => null),
    isVoiceSessionStarted: vi.fn(() => false),
}));

vi.mock('@/sync/persistence', () => ({
    getVoiceMessageCount: vi.fn(() => 3),
    incrementVoiceMessageCount: vi.fn(),
}));

import { OrbitRemoteSessionManager } from '@/remote/OrbitRemoteSessionManager';
import { trackVoicePermissionResponse } from '@/track';
import { incrementVoiceMessageCount } from '@/sync/persistence';
import { realtimeClientTools } from './realtimeClientTools';

describe('realtimeClientTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('routes voice message sending through OrbitRemoteSessionManager', async () => {
        const result = await realtimeClientTools.sendMessageToSession({
            sessionId: 'session-1',
            message: 'hello by voice',
        });

        expect(OrbitRemoteSessionManager).toHaveBeenCalledWith('session-1');
        expect(sendCurrentSessionMessage).toHaveBeenCalledWith({
            content: 'hello by voice',
            source: 'voice',
        });
        expect(incrementVoiceMessageCount).toHaveBeenCalledTimes(1);
        expect(result).toContain('sent');
    });

    it('routes permission responses through OrbitRemoteSessionManager', async () => {
        const allowResult = await realtimeClientTools.processPermissionRequest({
            requestId: 'request-1',
            decision: 'allow',
        });

        expect(OrbitRemoteSessionManager).toHaveBeenCalledWith('session-1');
        expect(allowPermission).toHaveBeenCalledWith('request-1');
        expect(trackVoicePermissionResponse).toHaveBeenCalledWith(true);
        expect(allowResult).toContain('done');

        const denyResult = await realtimeClientTools.processPermissionRequest({
            requestId: 'request-1',
            decision: 'deny',
        });

        expect(denyPermission).toHaveBeenCalledWith('request-1');
        expect(trackVoicePermissionResponse).toHaveBeenCalledWith(false);
        expect(denyResult).toContain('done');
    });
});
