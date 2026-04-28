import { describe, expect, it } from 'vitest';

import { buildResumeLaunch, formatResumeHelp, parseResumeCommandArgs } from './handleResumeCommand';

describe('parseResumeCommandArgs', () => {
    it('parses the orbit session id', () => {
        expect(parseResumeCommandArgs(['cmmij8olq00dp5jcxr3wtbpau'])).toEqual({
            showHelp: false,
            sessionId: 'cmmij8olq00dp5jcxr3wtbpau',
        });
    });

    it('recognizes help flags', () => {
        expect(parseResumeCommandArgs(['--help'])).toEqual({
            showHelp: true,
            sessionId: '',
        });
    });

    it('rejects missing session ids', () => {
        expect(() => parseResumeCommandArgs([])).toThrow(
            'Orbit session ID is required: orbit resume <session-id>',
        );
    });
});

describe('buildResumeLaunch', () => {
    it('builds a Codex resume command', () => {
        expect(buildResumeLaunch({
            id: 'session-1',
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: {
                path: '/tmp/p1-control-flow',
                flavor: 'codex',
                codexThreadId: '019ccca5-726b-7c61-b914-16de27dfab6e',
                host: 'localhost',
                homeDir: '/tmp',
                orbitHomeDir: '/tmp/.orbit',
                orbitLibDir: '/tmp/orbit',
                orbitToolsDir: '/tmp/orbit/tools',
            },
        })).toEqual({
            cwd: '/tmp/p1-control-flow',
            args: ['codex', '--resume', '019ccca5-726b-7c61-b914-16de27dfab6e'],
        });
    });

    it('builds a Claude resume command', () => {
        expect(buildResumeLaunch({
            id: 'session-2',
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: {
                path: '/tmp/repo',
                flavor: 'claude',
                claudeSessionId: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
                host: 'localhost',
                homeDir: '/tmp',
                orbitHomeDir: '/tmp/.orbit',
                orbitLibDir: '/tmp/orbit',
                orbitToolsDir: '/tmp/orbit/tools',
            },
        })).toEqual({
            cwd: '/tmp/repo',
            args: ['claude', '--resume', '93a9705e-bc6a-406d-8dce-8acc014dedbd'],
        });
    });

    it('builds a Gemini resume command', () => {
        expect(buildResumeLaunch({
            id: 'session-3',
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: {
                path: '/tmp/repo',
                flavor: 'gemini',
                geminiSessionId: 'gemini-session-123',
                host: 'localhost',
                homeDir: '/tmp',
                orbitHomeDir: '/tmp/.orbit',
                orbitLibDir: '/tmp/orbit',
                orbitToolsDir: '/tmp/orbit/tools',
            },
        })).toEqual({
            cwd: '/tmp/repo',
            args: ['gemini', '--resume', 'gemini-session-123'],
        });
    });

    it('can resume imported native history wrappers through their remembered backend ids', () => {
        expect(buildResumeLaunch({
            id: 'session-3b',
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: {
                path: '/tmp/repo',
                flavor: 'codex',
                nativeHistorySourceTool: 'codex',
                nativeHistorySourceBackendId: 'thread-from-history',
                host: 'localhost',
                homeDir: '/tmp',
                orbitHomeDir: '/tmp/.orbit',
                orbitLibDir: '/tmp/orbit',
                orbitToolsDir: '/tmp/orbit/tools',
            },
        })).toEqual({
            cwd: '/tmp/repo',
            args: ['codex', '--resume', 'thread-from-history'],
        });
    });

    it('rejects unsupported flavors', () => {
        expect(() => buildResumeLaunch({
            id: 'session-4',
            updatedAt: 1,
            active: false,
            activeAt: 1,
            metadata: {
                path: '/tmp/repo',
                flavor: 'openclaw',
                host: 'localhost',
                homeDir: '/tmp',
                orbitHomeDir: '/tmp/.orbit',
                orbitLibDir: '/tmp/orbit',
                orbitToolsDir: '/tmp/orbit/tools',
            },
        })).toThrow('Orbit session session-4 uses unsupported flavor "openclaw".');
    });
});

describe('formatResumeHelp', () => {
    it('mentions the session id command shape', () => {
        expect(formatResumeHelp()).toContain('orbit resume <orbit-session-id>');
    });

    it('explains that archived wrappers continue the active native thread when possible', () => {
        expect(formatResumeHelp()).toContain('newest active');
    });
});
