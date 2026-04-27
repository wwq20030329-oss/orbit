import { describe, expect, it } from 'vitest';

import { shouldReportSessionStartToDaemon } from './shouldReportSessionStartToDaemon';

describe('shouldReportSessionStartToDaemon', () => {
    it('reports daemon-spawned remote sessions', () => {
        expect(shouldReportSessionStartToDaemon({
            startedBy: 'daemon',
            startingMode: 'remote',
        })).toBe(true);
    });

    it('skips terminal-started sessions', () => {
        expect(shouldReportSessionStartToDaemon({
            startedBy: 'terminal',
            startingMode: 'remote',
        })).toBe(false);
    });

    it('skips daemon sessions when they are not remote', () => {
        expect(shouldReportSessionStartToDaemon({
            startedBy: 'daemon',
            startingMode: 'local',
        })).toBe(false);
    });

    it('skips sessions without daemon ownership metadata', () => {
        expect(shouldReportSessionStartToDaemon({})).toBe(false);
    });
});
