import { describe, expect, it } from 'vitest';

import {
  buildNativeCliResumeSessionTag,
  buildReplayEnvelopes,
  extractCodexReplayMessages,
  extractGeminiReplayMessages,
  markNativeCliHistoryImported,
  shouldReplayNativeCliHistory,
} from './nativeCliHistoryReplay';
import type { Metadata } from '@/api/types';

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

describe('native history import metadata', () => {
  const request = {
    tool: 'codex' as const,
    backendId: 'thread-123',
    title: 'Current rollout thread',
    summary: null,
    updatedAt: 400,
  };
  const baseMetadata: Metadata = {
    path: '/tmp/project',
    host: 'host',
    homeDir: '/Users/test',
    orbitHomeDir: '/Users/test/.orbit',
    orbitLibDir: '/tmp/orbit',
    orbitToolsDir: '/tmp/orbit/tools',
  };

  it('builds a unique orbit wrapper session tag for each native CLI history import', () => {
    const firstTag = buildNativeCliResumeSessionTag(request);
    const secondTag = buildNativeCliResumeSessionTag(request);

    expect(firstTag).toMatch(/^native-history-import:codex:thread-123:/);
    expect(secondTag).toMatch(/^native-history-import:codex:thread-123:/);
    expect(secondTag).not.toBe(firstTag);
  });

  it('replays history only until that native thread has been imported for the current CLI history snapshot', () => {
    expect(shouldReplayNativeCliHistory(baseMetadata, request)).toBe(true);
    expect(shouldReplayNativeCliHistory({
      ...baseMetadata,
      nativeHistorySourceTool: 'codex',
      nativeHistorySourceBackendId: 'thread-123',
      nativeHistoryImportedAt: 450,
    }, request)).toBe(false);
    expect(shouldReplayNativeCliHistory({
      ...baseMetadata,
      nativeHistorySourceTool: 'codex',
      nativeHistorySourceBackendId: 'thread-123',
      nativeHistoryImportedAt: 123,
    }, request)).toBe(true);
  });

  it('marks session metadata after native history import completes', () => {
    expect(markNativeCliHistoryImported(baseMetadata, request, 456)).toMatchObject({
      codexThreadId: 'thread-123',
      nativeHistorySourceTool: 'codex',
      nativeHistorySourceBackendId: 'thread-123',
      nativeHistoryImportedAt: 456,
    });
  });
});
