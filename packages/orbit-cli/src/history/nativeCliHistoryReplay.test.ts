import { describe, expect, it } from 'vitest';

import {
  buildReplayEnvelopes,
  extractCodexReplayMessages,
  extractGeminiReplayMessages,
} from './nativeCliHistoryReplay';

describe('extractCodexReplayMessages', () => {
  it('keeps user and assistant text while skipping setup noise', () => {
    const archive = [
      JSON.stringify({
        timestamp: '2026-04-12T00:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'developer instructions' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-12T00:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: '你好\n',
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-12T00:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '你好。' }],
        },
      }),
    ].join('\n');

    expect(extractCodexReplayMessages(archive)).toEqual([
      { role: 'user', text: '你好', timestamp: Date.parse('2026-04-12T00:00:01.000Z') },
      { role: 'agent', text: '你好。', timestamp: Date.parse('2026-04-12T00:00:02.000Z') },
    ]);
  });
});

describe('extractGeminiReplayMessages', () => {
  it('strips injected previous-context wrappers and preserves assistant replies', () => {
    const raw = JSON.stringify({
      messages: [
        {
          type: 'user',
          timestamp: '2026-04-12T00:00:01.000Z',
          content: [{
            text: '[PREVIOUS CONVERSATION CONTEXT]\nfoo\n[END OF PREVIOUS CONTEXT]\n\n你好',
          }],
        },
        {
          type: 'assistant',
          timestamp: '2026-04-12T00:00:02.000Z',
          content: [{
            text: '你好呀',
          }],
        },
      ],
    });

    expect(extractGeminiReplayMessages(raw)).toEqual([
      { role: 'user', text: '你好', timestamp: Date.parse('2026-04-12T00:00:01.000Z') },
      { role: 'agent', text: '你好呀', timestamp: Date.parse('2026-04-12T00:00:02.000Z') },
    ]);
  });
});

describe('buildReplayEnvelopes', () => {
  it('assigns history agent messages to the current synthetic turn', () => {
    const envelopes = buildReplayEnvelopes('claude-session', [
      { role: 'user', text: 'hello', timestamp: 100 },
      { role: 'agent', text: 'world', timestamp: 200 },
    ]);

    expect(envelopes).toEqual([
      {
        id: 'history:claude-session:0',
        time: 100,
        role: 'user',
        ev: {
          t: 'text',
          text: 'hello',
        },
      },
      {
        id: 'history:claude-session:1',
        time: 201,
        role: 'agent',
        turn: 'history:claude-session:1',
        ev: {
          t: 'text',
          text: 'world',
        },
      },
    ]);
  });
});
