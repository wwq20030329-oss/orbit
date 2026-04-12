import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildNativeCliResumeLaunch,
  listNativeCliHistory,
  type NativeCliHistoryEntry,
} from './nativeCliHistory';

async function touch(path: string, secondsAgo: number): Promise<void> {
  const when = new Date(Date.now() - secondsAgo * 1000);
  await utimes(path, when, when);
}

describe('nativeCliHistory', () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('lists Claude, Codex, and Gemini history entries from local tool storage', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-'));
    createdDirs.push(homeDir);

    const claudeSessionId = '11111111-1111-4111-8111-111111111111';
    const codexSessionId = '22222222-2222-4222-8222-222222222222';
    const geminiSessionId = '33333333-3333-4333-8333-333333333333';

    const claudeProjectDir = join(homeDir, '.claude', 'projects', 'project-a');
    await mkdir(claudeProjectDir, { recursive: true });
    const claudeSessionPath = join(claudeProjectDir, `${claudeSessionId}.jsonl`);
    await writeFile(
      claudeSessionPath,
      [
        JSON.stringify({
          type: 'user',
          uuid: 'msg-1',
          cwd: '/Users/test/work/claude-project',
          message: { content: 'Fix the broken build pipeline and clean the release script.' },
        }),
        JSON.stringify({
          type: 'summary',
          leafUuid: 'summary-1',
          summary: 'Fix build pipeline',
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(claudeSessionPath, 90);

    const codexDir = join(homeDir, '.codex');
    await mkdir(join(codexDir, 'archived_sessions'), { recursive: true });
    await writeFile(
      join(codexDir, 'session_index.jsonl'),
      JSON.stringify({
        id: codexSessionId,
        thread_name: 'Refactor auth middleware',
        updated_at: '2026-04-12T10:20:30.000Z',
      }) + '\n',
      'utf8',
    );
    await writeFile(
      join(codexDir, 'archived_sessions', `rollout-2026-04-12T10-20-30-${codexSessionId}.jsonl`),
      JSON.stringify({
        type: 'session_meta',
        payload: {
          cwd: '/Users/test/work/codex-project',
        },
      }) + '\n',
      'utf8',
    );

    const geminiProjectDir = join(homeDir, '.gemini', 'tmp', 'gemini-project');
    await mkdir(join(geminiProjectDir, 'chats'), { recursive: true });
    await writeFile(join(geminiProjectDir, '.project_root'), '/Users/test/work/gemini-project', 'utf8');
    await writeFile(
      join(geminiProjectDir, 'chats', 'session-2026-04-12T10-30.json'),
      JSON.stringify({
        sessionId: geminiSessionId,
        startTime: '2026-04-12T10:30:00.000Z',
        lastUpdated: '2026-04-12T10:31:00.000Z',
        messages: [
          {
            type: 'user',
            content: [
              {
                text: '[PREVIOUS CONVERSATION CONTEXT]\nUser: old\n[END OF PREVIOUS CONTEXT]\nCreate a launch checklist for the VPS deployment.',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries.map((entry) => entry.tool)).toEqual(['claude', 'gemini', 'codex']);
    expect(entries.map((entry) => entry.backendId)).toEqual([claudeSessionId, geminiSessionId, codexSessionId]);

    expect(entries[0]).toMatchObject({
      tool: 'claude',
      workingDirectory: '/Users/test/work/claude-project',
      title: 'Fix the broken build pipeline and clean the release script.',
      summary: 'Fix build pipeline',
    });

    expect(entries[1]).toMatchObject({
      tool: 'gemini',
      workingDirectory: '/Users/test/work/gemini-project',
      title: 'Create a launch checklist for the VPS deployment.',
    });

    expect(entries[2]).toMatchObject({
      tool: 'codex',
      workingDirectory: '/Users/test/work/codex-project',
      title: 'Refactor auth middleware',
    });
  });

  it('builds provider-specific resume launches', () => {
    const baseEntry: Omit<NativeCliHistoryEntry, 'tool' | 'backendId' | 'id'> = {
      title: 'Title',
      summary: null,
      workingDirectory: '/tmp/project',
      updatedAt: Date.now(),
    };

    expect(
      buildNativeCliResumeLaunch({
        ...baseEntry,
        id: 'claude:1',
        tool: 'claude',
        backendId: 'claude-session-id',
      }, {
        startedBy: 'daemon',
        claudeStartingMode: 'remote',
      }),
    ).toEqual({
      cwd: '/tmp/project',
      args: ['claude', '--orbit-starting-mode', 'remote', '--started-by', 'daemon', '--resume', 'claude-session-id'],
    });

    expect(
      buildNativeCliResumeLaunch({
        ...baseEntry,
        id: 'codex:1',
        tool: 'codex',
        backendId: 'codex-thread-id',
      }, {
        startedBy: 'daemon',
      }),
    ).toEqual({
      cwd: '/tmp/project',
      args: ['codex', '--resume', 'codex-thread-id', '--started-by', 'daemon'],
    });

    expect(
      buildNativeCliResumeLaunch({
        ...baseEntry,
        id: 'gemini:1',
        tool: 'gemini',
        backendId: 'gemini-session-id',
      }, {
        startedBy: 'daemon',
      }),
    ).toEqual({
      cwd: '/tmp/project',
      args: ['gemini', '--resume', 'gemini-session-id', '--started-by', 'daemon'],
    });
  });
});
