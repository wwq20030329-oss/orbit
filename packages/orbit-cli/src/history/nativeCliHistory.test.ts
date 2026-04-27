import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildNativeCliResumeLaunch,
  deleteNativeCliHistoryEntry,
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
    const codexSessionsDir = join(codexDir, 'sessions', '2026', '04', '12');
    await mkdir(codexSessionsDir, { recursive: true });
    await writeFile(
      join(codexDir, 'session_index.jsonl'),
      JSON.stringify({
        id: codexSessionId,
        thread_name: 'Refactor auth middleware',
        updated_at: '2026-04-12T10:20:30.000Z',
      }) + '\n',
      'utf8',
    );
    const codexLiveSessionPath = join(codexSessionsDir, `rollout-2026-04-12T10-20-30-${codexSessionId}.jsonl`);
    await writeFile(
      codexLiveSessionPath,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: {
            id: codexSessionId,
            cwd: '/Users/test/work/codex-project',
          },
        }),
        JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Refactor auth middleware to avoid duplicate permission checks.',
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(codexLiveSessionPath, 180);

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

    expect(entries.map((entry) => entry.tool)).toEqual(['claude', 'codex', 'gemini']);
    expect(entries.map((entry) => entry.backendId)).toEqual([claudeSessionId, codexSessionId, geminiSessionId]);

    expect(entries[0]).toMatchObject({
      tool: 'claude',
      workingDirectory: '/Users/test/work/claude-project',
      title: 'Fix the broken build pipeline and clean the release script.',
      summary: 'Fix build pipeline',
      isLive: true,
    });

    expect(entries[1]).toMatchObject({
      tool: 'codex',
      workingDirectory: '/Users/test/work/codex-project',
      title: 'Refactor auth middleware',
      isLive: true,
    });

    expect(entries[2]).toMatchObject({
      tool: 'gemini',
      workingDirectory: '/Users/test/work/gemini-project',
      title: 'Create a launch checklist for the VPS deployment.',
    });
  });

  it('deletes Claude, Codex, and Gemini history from local tool storage', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-delete-'));
    createdDirs.push(homeDir);

    const claudeSessionId = '12111111-1111-4111-8111-111111111111';
    const codexSessionId = '23222222-2222-4222-8222-222222222222';
    const geminiSessionId = '34333333-3333-4333-8333-333333333333';

    const claudeWorkingDirectory = '/Users/test/work/claude-delete-project';
    const claudeProjectDir = join(homeDir, '.claude', 'projects', 'Users-test-work-claude-delete-project');
    await mkdir(claudeProjectDir, { recursive: true });
    await writeFile(
      join(claudeProjectDir, `${claudeSessionId}.jsonl`),
      JSON.stringify({
        type: 'user',
        uuid: 'msg-1',
        cwd: claudeWorkingDirectory,
        message: { content: 'Delete this Claude session from local storage.' },
      }) + '\n',
      'utf8',
    );

    const codexDir = join(homeDir, '.codex');
    await mkdir(join(codexDir, 'archived_sessions'), { recursive: true });
    const codexArchivedSessionPath = join(codexDir, 'archived_sessions', `rollout-2026-04-12T10-20-30-${codexSessionId}.jsonl`);
    await writeFile(
      join(codexDir, 'session_index.jsonl'),
      JSON.stringify({
        id: codexSessionId,
        thread_name: 'Delete codex history',
        updated_at: '2026-04-12T10:20:30.000Z',
      }) + '\n',
      'utf8',
    );
    await writeFile(
      codexArchivedSessionPath,
      JSON.stringify({
        type: 'session_meta',
        payload: {
          cwd: '/Users/test/work/codex-delete-project',
        },
      }) + '\n',
      'utf8',
    );

    const geminiProjectDir = join(homeDir, '.gemini', 'tmp', 'gemini-delete-project');
    const geminiSessionPath = join(geminiProjectDir, 'chats', 'session-2026-04-12T10-30.json');
    await mkdir(join(geminiProjectDir, 'chats'), { recursive: true });
    await writeFile(join(geminiProjectDir, '.project_root'), '/Users/test/work/gemini-delete-project', 'utf8');
    await writeFile(
      geminiSessionPath,
      JSON.stringify({
        sessionId: geminiSessionId,
        startTime: '2026-04-12T10:30:00.000Z',
        lastUpdated: '2026-04-12T10:31:00.000Z',
        messages: [
          {
            type: 'user',
            content: [{ text: 'Delete this Gemini session.' }],
          },
        ],
      }),
      'utf8',
    );

    await deleteNativeCliHistoryEntry({
      tool: 'claude',
      backendId: claudeSessionId,
      workingDirectory: claudeWorkingDirectory,
      homeDir,
    });
    await deleteNativeCliHistoryEntry({
      tool: 'codex',
      backendId: codexSessionId,
      homeDir,
    });
    await deleteNativeCliHistoryEntry({
      tool: 'gemini',
      backendId: geminiSessionId,
      homeDir,
    });

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });
    const codexSessionIndex = await readFile(join(codexDir, 'session_index.jsonl'), 'utf8');

    expect(entries).toEqual([]);
    expect(codexSessionIndex).not.toContain(codexSessionId);
  });

  it('lists live Codex sessions from ~/.codex/sessions and skips subagent threads', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-live-codex-'));
    createdDirs.push(homeDir);

    const liveSessionId = '44444444-4444-4444-8444-444444444444';
    const subagentSessionId = '55555555-5555-4555-8555-555555555555';

    const sessionsDir = join(homeDir, '.codex', 'sessions', '2026', '04', '12');
    await mkdir(sessionsDir, { recursive: true });

    const liveSessionPath = join(sessionsDir, `rollout-2026-04-12T11-22-33-${liveSessionId}.jsonl`);
    await writeFile(
      liveSessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-12T11:22:33.000Z',
          type: 'session_meta',
          payload: {
            id: liveSessionId,
            cwd: '/Users/test/work/live-codex-project',
            originator: 'Codex Desktop',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-12T11:22:34.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Show me the current rollout blockers and next steps.\n',
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(liveSessionPath, 15);

    const subagentSessionPath = join(sessionsDir, `rollout-2026-04-12T11-25-00-${subagentSessionId}.jsonl`);
    await writeFile(
      subagentSessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-12T11:25:00.000Z',
          type: 'session_meta',
          payload: {
            id: subagentSessionId,
            cwd: '/Users/test/work/live-codex-project',
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: liveSessionId,
                },
              },
            },
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-12T11:25:01.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'This should not be listed.\n',
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(subagentSessionPath, 5);

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toEqual([
      expect.objectContaining({
        tool: 'codex',
        backendId: liveSessionId,
        workingDirectory: '/Users/test/work/live-codex-project',
        title: 'Show me the current rollout blockers and next steps.',
        isLive: true,
      }),
    ]);
  });

  it('keeps stale Codex live-directory sessions in history without marking them online', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-stale-codex-'));
    createdDirs.push(homeDir);

    const staleSessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const sessionsDir = join(homeDir, '.codex', 'sessions', '2026', '04', '12');
    await mkdir(sessionsDir, { recursive: true });

    const staleSessionPath = join(sessionsDir, `rollout-2026-04-12T11-22-33-${staleSessionId}.jsonl`);
    await writeFile(
      staleSessionPath,
      [
        JSON.stringify({
          timestamp: '2026-04-12T11:22:33.000Z',
          type: 'session_meta',
          payload: {
            id: staleSessionId,
            cwd: '/Users/test/work/stale-codex-project',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-12T11:22:34.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Investigate stale live session detection in Orbit.',
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(staleSessionPath, 11 * 60);

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toEqual([
      expect.objectContaining({
        tool: 'codex',
        backendId: staleSessionId,
        workingDirectory: '/Users/test/work/stale-codex-project',
        title: 'Investigate stale live session detection in Orbit.',
        isLive: false,
      }),
    ]);
  });

  it('lists archived-only Codex sessions from the official archived_sessions store', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-archived-codex-'));
    createdDirs.push(homeDir);

    const archivedSessionId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const codexDir = join(homeDir, '.codex');
    const archivedDir = join(codexDir, 'archived_sessions');
    await mkdir(archivedDir, { recursive: true });
    await writeFile(
      join(codexDir, 'session_index.jsonl'),
      JSON.stringify({
        id: archivedSessionId,
        thread_name: 'Continue the archived rollout thread',
        updated_at: '2026-04-12T10:20:30.000Z',
      }) + '\n',
      'utf8',
    );
    const archivedPath = join(archivedDir, `rollout-2026-04-12T10-20-30-${archivedSessionId}.jsonl`);
    await writeFile(
      archivedPath,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: {
            id: archivedSessionId,
            cwd: '/Users/test/work/archived-codex-project',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-12T10:20:31.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Continue the archived rollout thread from mobile.',
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toEqual([
      expect.objectContaining({
        tool: 'codex',
        backendId: archivedSessionId,
        workingDirectory: '/Users/test/work/archived-codex-project',
        title: 'Continue the archived rollout thread',
        isLive: false,
      }),
    ]);
  });

  it('attaches the shared project root for nested CLI working directories', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-project-root-'));
    createdDirs.push(homeDir);

    const repoRoot = join(homeDir, 'workspace', 'claudeapp');
    const nestedProjectDir = join(repoRoot, 'packages', 'orbit-app');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(join(homeDir, '.claude', 'projects', 'project-root-test'), { recursive: true });

    const claudeSessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const claudeSessionPath = join(
      homeDir,
      '.claude',
      'projects',
      'project-root-test',
      `${claudeSessionId}.jsonl`,
    );

    await writeFile(
      claudeSessionPath,
      JSON.stringify({
        type: 'user',
        uuid: 'msg-1',
        cwd: nestedProjectDir,
        message: { content: 'Show the project root instead of every nested package.' },
      }) + '\n',
      'utf8',
    );
    await touch(claudeSessionPath, 10);

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toContainEqual(expect.objectContaining({
      tool: 'claude',
      workingDirectory: nestedProjectDir,
      projectRoot: repoRoot,
    }));
  });

  it('skips trivial Claude greetings when a later meaningful title exists', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-claude-title-'));
    createdDirs.push(homeDir);

    const claudeSessionId = '66666666-6666-4666-8666-666666666666';
    const claudeProjectDir = join(homeDir, '.claude', 'projects', 'project-b');
    await mkdir(claudeProjectDir, { recursive: true });
    const claudeSessionPath = join(claudeProjectDir, `${claudeSessionId}.jsonl`);
    await writeFile(
      claudeSessionPath,
      [
        JSON.stringify({
          type: 'user',
          uuid: 'msg-1',
          cwd: '/Users/test/work/claude-project',
          message: { content: 'hello' },
        }),
        JSON.stringify({
          type: 'user',
          uuid: 'msg-2',
          cwd: '/Users/test/work/claude-project',
          message: { content: 'Trace why the mobile session list duplicates Orbit mirror sessions.' },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(claudeSessionPath, 30);

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toContainEqual(expect.objectContaining({
      tool: 'claude',
      backendId: claudeSessionId,
      title: 'Trace why the mobile session list duplicates Orbit mirror sessions.',
      isLive: true,
    }));
  });

  it('scans past excluded Claude sdk candidates until it fills the requested limit', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-claude-scan-'));
    createdDirs.push(homeDir);

    const skippedProjectDir = join(homeDir, '.claude', 'projects', 'project-skip');
    await mkdir(skippedProjectDir, { recursive: true });

    for (let index = 0; index < 3; index += 1) {
      const sessionId = `00000000-0000-4000-8000-00000000000${index}`;
      const sessionPath = join(skippedProjectDir, `${sessionId}.jsonl`);
      await writeFile(
        sessionPath,
        JSON.stringify({
          type: 'user',
          uuid: `skip-${index}`,
          cwd: '/Users/test/work/project',
          entrypoint: 'sdk-cli',
          message: { content: `Reply with exactly skip-${index}` },
        }) + '\n',
        'utf8',
      );
      await touch(sessionPath, (11 * 60) + index);
    }

    const meaningfulSessionId = '12345678-1234-4234-8234-123456789abc';
    const meaningfulProjectDir = join(homeDir, '.claude', 'projects', 'project-keep');
    await mkdir(meaningfulProjectDir, { recursive: true });
    const meaningfulSessionPath = join(meaningfulProjectDir, `${meaningfulSessionId}.jsonl`);
    await writeFile(
      meaningfulSessionPath,
      JSON.stringify({
        type: 'user',
        uuid: 'keep-1',
        cwd: '/Users/test/work/important-project',
        message: { content: 'Diagnose why Claude history is missing from the mobile sessions page.' },
      }) + '\n',
      'utf8',
    );
    await touch(meaningfulSessionPath, 30);

    const entries = await listNativeCliHistory({ homeDir, limit: 1 });

    expect(entries).toEqual([
      expect.objectContaining({
        tool: 'claude',
        backendId: meaningfulSessionId,
        title: 'Diagnose why Claude history is missing from the mobile sessions page.',
      }),
    ]);
  });

  it('skips Claude sessions created by sdk and print entrypoints', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-claude-sdk-filter-'));
    createdDirs.push(homeDir);

    const projectDir = join(homeDir, '.claude', 'projects', 'project-sdk');
    await mkdir(projectDir, { recursive: true });

    const sdkSessionId = '12345678-1111-4111-8111-123456789abc';
    const interactiveSessionId = '12345678-2222-4222-8222-123456789abd';

    await writeFile(
      join(projectDir, `${sdkSessionId}.jsonl`),
      JSON.stringify({
        type: 'user',
        uuid: 'sdk-1',
        cwd: '/Users/test/work/claude-project',
        entrypoint: 'sdk-cli',
        message: { content: 'Reply with exactly OK' },
      }) + '\n',
      'utf8',
    );
    await touch(join(projectDir, `${sdkSessionId}.jsonl`), 20);

    await writeFile(
      join(projectDir, `${interactiveSessionId}.jsonl`),
      JSON.stringify({
        type: 'user',
        uuid: 'cli-1',
        cwd: '/Users/test/work/claude-project',
        entrypoint: 'cli',
        message: { content: 'Trace the official Claude resume picker rules.' },
      }) + '\n',
      'utf8',
    );
    await touch(join(projectDir, `${interactiveSessionId}.jsonl`), 10);

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries).toEqual([
      expect.objectContaining({
        tool: 'claude',
        backendId: interactiveSessionId,
        title: 'Trace the official Claude resume picker rules.',
      }),
    ]);
  });

  it('applies the limit per CLI instead of truncating the combined list', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-per-tool-limit-'));
    createdDirs.push(homeDir);

    const claudeSessionId = '77777777-7777-4777-8777-777777777777';
    const codexSessionId = '88888888-8888-4888-8888-888888888888';
    const geminiSessionId = '99999999-9999-4999-8999-999999999999';

    const claudeProjectDir = join(homeDir, '.claude', 'projects', 'project-c');
    await mkdir(claudeProjectDir, { recursive: true });
    const claudeSessionPath = join(claudeProjectDir, `${claudeSessionId}.jsonl`);
    await writeFile(
      claudeSessionPath,
      JSON.stringify({
        type: 'user',
        uuid: 'msg-claude',
        cwd: '/Users/test/work/claude-project',
        message: { content: 'Audit the Claude history sync path.' },
      }) + '\n',
      'utf8',
    );
    await touch(claudeSessionPath, 10);

    const codexSessionsDir = join(homeDir, '.codex', 'sessions', '2026', '04', '12');
    await mkdir(codexSessionsDir, { recursive: true });
    const codexLivePath = join(codexSessionsDir, `rollout-2026-04-12T11-40-00-${codexSessionId}.jsonl`);
    await writeFile(
      codexLivePath,
      [
        JSON.stringify({
          type: 'session_meta',
          payload: {
            id: codexSessionId,
            cwd: '/Users/test/work/codex-project',
          },
        }),
        JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Show the Codex session in the synced history list.',
          },
        }),
      ].join('\n'),
      'utf8',
    );
    await touch(codexLivePath, 20);

    const geminiProjectDir = join(homeDir, '.gemini', 'tmp', 'gemini-project');
    await mkdir(join(geminiProjectDir, 'chats'), { recursive: true });
    await writeFile(join(geminiProjectDir, '.project_root'), '/Users/test/work/gemini-project', 'utf8');
    await writeFile(
      join(geminiProjectDir, 'chats', 'session-2026-04-12T11-50.json'),
      JSON.stringify({
        sessionId: geminiSessionId,
        startTime: '2026-04-12T11:50:00.000Z',
        lastUpdated: '2026-04-12T11:51:00.000Z',
        messages: [
          {
            type: 'user',
            content: [{ text: 'List the Gemini session too.' }],
          },
        ],
      }),
      'utf8',
    );

    const entries = await listNativeCliHistory({ homeDir, limit: 1 });

    expect(entries.map((entry) => entry.tool)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('skips Gemini subagent sessions and deduplicates by session id', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'orbit-native-history-gemini-dedupe-'));
    createdDirs.push(homeDir);

    const projectA = join(homeDir, '.gemini', 'tmp', 'gemini-project-a');
    const projectB = join(homeDir, '.gemini', 'tmp', 'gemini-project-b');
    await mkdir(join(projectA, 'chats'), { recursive: true });
    await mkdir(join(projectB, 'chats'), { recursive: true });
    await writeFile(join(projectA, '.project_root'), '/Users/test/work/gemini-project', 'utf8');
    await writeFile(join(projectB, '.project_root'), '/Users/test/work/gemini-project', 'utf8');

    const sharedSessionId = 'aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa';
    await writeFile(
      join(projectA, 'chats', 'session-a.json'),
      JSON.stringify({
        sessionId: sharedSessionId,
        startTime: '2026-04-12T11:50:00.000Z',
        lastUpdated: '2026-04-12T11:51:00.000Z',
        messages: [
          {
            type: 'user',
            content: [{ text: 'Older Gemini session title.' }],
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      join(projectB, 'chats', 'session-b.json'),
      JSON.stringify({
        sessionId: sharedSessionId,
        startTime: '2026-04-12T11:52:00.000Z',
        lastUpdated: '2026-04-12T11:53:00.000Z',
        messages: [
          {
            type: 'user',
            content: [{ text: 'Latest Gemini session title.' }],
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      join(projectB, 'chats', 'session-subagent.json'),
      JSON.stringify({
        sessionId: 'bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb',
        kind: 'subagent',
        startTime: '2026-04-12T11:54:00.000Z',
        lastUpdated: '2026-04-12T11:55:00.000Z',
        messages: [
          {
            type: 'user',
            content: [{ text: 'Internal subagent task.' }],
          },
        ],
      }),
      'utf8',
    );

    const entries = await listNativeCliHistory({ homeDir, limit: 10 });

    expect(entries.filter((entry) => entry.tool === 'gemini')).toEqual([
      expect.objectContaining({
        backendId: sharedSessionId,
        title: 'Latest Gemini session title.',
      }),
    ]);
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
