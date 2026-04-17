import { describe, expect, it } from 'vitest';
import {
    getSessionIdentifierFromNotificationData,
    getSessionIdentifierFromNotificationResponse,
} from './notificationRouting';

describe('getSessionIdentifierFromNotificationData', () => {
    it('returns a session identifier when sessionId exists', () => {
        expect(getSessionIdentifierFromNotificationData({ sessionId: 'session-123' })).toBe('session-123');
    });

    it('preserves session ids that contain spaces', () => {
        expect(getSessionIdentifierFromNotificationData({ sessionId: 'session 123' })).toBe('session 123');
    });

    it('returns null when sessionId is missing', () => {
        expect(getSessionIdentifierFromNotificationData({ kind: 'done' })).toBeNull();
    });

    it('returns null for empty session ids', () => {
        expect(getSessionIdentifierFromNotificationData({ sessionId: '   ' })).toBeNull();
    });

    it('uses a session url when present', () => {
        expect(getSessionIdentifierFromNotificationData({ url: '/session/session-123' })).toBe('session-123');
    });

    it('decodes encoded session ids from urls', () => {
        expect(getSessionIdentifierFromNotificationData({ url: '/session/session%20123' })).toBe('session 123');
    });
});

describe('getSessionIdentifierFromNotificationResponse', () => {
    it('reads the identifier from content data', () => {
        expect(getSessionIdentifierFromNotificationResponse({
            notification: {
                request: {
                    content: {
                        data: { sessionId: 'session-123' }
                    }
                }
            }
        })).toBe('session-123');
    });

    it('returns null when content data is missing', () => {
        expect(getSessionIdentifierFromNotificationResponse({
            notification: {
                request: {
                    content: {}
                }
            }
        })).toBeNull();
    });
});
