import { describe, expect, it } from 'vitest';

import { getSessionLifecycleState } from './sessionLifecycle';

describe('getSessionLifecycleState', () => {
    it('detects acp and codex task_started/task_complete events', () => {
        expect(getSessionLifecycleState({
            content: {
                type: 'acp',
                data: {
                    type: 'task_started'
                }
            }
        })).toEqual({
            isTaskComplete: false,
            isTaskStarted: true
        });

        expect(getSessionLifecycleState({
            content: {
                type: 'codex',
                data: {
                    type: 'task_complete'
                }
            }
        })).toEqual({
            isTaskComplete: true,
            isTaskStarted: false
        });
    });

    it('detects session turn lifecycle events', () => {
        expect(getSessionLifecycleState({
            content: {
                type: 'session',
                data: {
                    ev: {
                        t: 'turn-start'
                    }
                }
            }
        })).toEqual({
            isTaskComplete: false,
            isTaskStarted: true
        });

        expect(getSessionLifecycleState({
            content: {
                type: 'session',
                data: {
                    ev: {
                        t: 'turn-end'
                    }
                }
            }
        })).toEqual({
            isTaskComplete: true,
            isTaskStarted: false
        });
    });

    it('ignores unrelated payloads', () => {
        expect(getSessionLifecycleState({
            content: {
                type: 'text',
                data: {
                    type: 'note'
                }
            }
        })).toEqual({
            isTaskComplete: false,
            isTaskStarted: false
        });
    });
});
