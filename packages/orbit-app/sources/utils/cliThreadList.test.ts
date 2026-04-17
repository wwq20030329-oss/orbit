import { describe, expect, it, vi } from 'vitest';

import type { NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

import {
  buildCliThreadToolSections,
  formatCliThreadUpdatedAt,
  getCliThreadScopedProjects,
  pickPreferredCliThreadTool,
  pickCurrentCliThreadProject,
} from './cliThreadList';

function createSession(
  id: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: false,
    activeAt: 1,
    metadata: {
      machineId: 'machine-1',
      host: 'wwq-mac',
      path: '/Users/test/project',
      flavor: 'claude',
      ...overrides.metadata,
    },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence: 1,
    ...overrides,
  };
}

describe('buildCliThreadToolSections', () => {
  it('splits native threads by tool and sorts them by most recent activity', () => {
    const data: Array<
      | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
      | { type: 'session'; session: Session; displayTitle?: string }
    > = [
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:1',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude-project',
          title: 'Claude task',
          summary: null,
          updatedAt: 300,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:2',
          tool: 'codex',
          backendId: 'codex-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/codex-b',
          title: 'Codex newer',
          summary: null,
          updatedAt: 500,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:1',
          tool: 'codex',
          backendId: 'codex-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/codex-a',
          title: 'Codex older',
          summary: null,
          updatedAt: 200,
        },
      },
    ];

    const sections = buildCliThreadToolSections(data);

    expect(sections[0]?.tool).toBe('claude');
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['Claude task']);
    expect(sections[0]?.projectCount).toBe(1);
    expect(sections[0]?.projects[0]?.title).toBe('claude-project');
    expect(sections[1]?.tool).toBe('codex');
    expect(sections[1]?.items.map((item) => item.title)).toEqual(['Codex newer', 'Codex older']);
    expect(sections[1]?.projectCount).toBe(2);
    expect(sections[2]?.tool).toBe('gemini');
    expect(sections[2]?.items).toEqual([]);
  });

  it('dedupes matching session and native rows in favor of the native thread entry', () => {
    const data: Array<
      | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
      | { type: 'session'; session: Session; displayTitle?: string }
    > = [
      {
        type: 'session',
        session: createSession('orbit-1', {
          updatedAt: 400,
          metadata: {
            machineId: 'machine-1',
            host: 'wwq-mac',
            path: '/Users/test/project',
            flavor: 'codex',
            codexThreadId: 'thread-1',
            summary: {
              text: 'Orbit wrapper',
              updatedAt: 400,
            },
          },
        }),
        displayTitle: 'Orbit wrapper',
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:thread-1',
          tool: 'codex',
          backendId: 'thread-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project',
          title: 'Native thread',
          summary: null,
          updatedAt: 450,
        },
        displayTitle: 'Native thread',
      },
    ];

    const codexItems = buildCliThreadToolSections(data).find((section) => section.tool === 'codex')?.items ?? [];

    expect(codexItems).toHaveLength(1);
    expect(codexItems[0]?.source).toBe('native');
    expect(codexItems[0]?.title).toBe('Native thread');
  });

  it('prefers official native history for a tool over extra Orbit fallback sessions', () => {
    const data: Array<
      | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
      | { type: 'session'; session: Session; displayTitle?: string }
    > = [
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:official-1',
          tool: 'claude',
          backendId: 'official-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claudeapp',
          title: 'Official thread',
          summary: null,
          updatedAt: 500,
        },
      },
      {
        type: 'session',
        session: createSession('orbit-wrapper-1', {
          updatedAt: 900,
          metadata: {
            machineId: 'machine-1',
            host: 'wwq-mac',
            path: '/Users/test/claudeapp',
            flavor: 'claude',
            claudeSessionId: 'orbit-only-wrapper',
            summary: {
              text: 'Orbit-only wrapper',
              updatedAt: 900,
            },
          },
        }),
        displayTitle: 'Orbit-only wrapper',
      },
    ];

    const claudeItems = buildCliThreadToolSections(data).find((section) => section.tool === 'claude')?.items ?? [];

    expect(claudeItems).toHaveLength(1);
    expect(claudeItems[0]?.source).toBe('native');
    expect(claudeItems[0]?.title).toBe('Official thread');
  });

  it('falls back to Orbit CLI sessions when native history is unavailable for a tool', () => {
    const data: Array<
      | { type: 'native-cli-session'; entry: NativeCliHistoryEntry; displayTitle?: string }
      | { type: 'session'; session: Session; displayTitle?: string }
    > = [
      {
        type: 'session',
        session: createSession('gemini-wrapper-1', {
          updatedAt: 900,
          metadata: {
            machineId: 'machine-1',
            host: 'wwq-mac',
            path: '/Users/test/gemini-project',
            flavor: 'gemini',
            geminiSessionId: 'gemini-session-1',
            summary: {
              text: 'Gemini wrapper',
              updatedAt: 900,
            },
          },
        }),
        displayTitle: 'Gemini wrapper',
      },
    ];

    const geminiItems = buildCliThreadToolSections(data).find((section) => section.tool === 'gemini')?.items ?? [];

    expect(geminiItems).toHaveLength(1);
    expect(geminiItems[0]?.source).toBe('session');
    expect(geminiItems[0]?.title).toBe('Gemini wrapper');
  });

  it('groups threads by working directory instead of collapsing them by project root', () => {
    const sections = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:1',
          tool: 'codex',
          backendId: 'thread-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project-a/packages/app',
          projectRoot: '/Users/test/project-a',
          title: 'Fix app shell',
          summary: null,
          updatedAt: 300,
          isLive: true,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:2',
          tool: 'codex',
          backendId: 'thread-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project-a/packages/server',
          projectRoot: '/Users/test/project-a',
          title: 'Refactor server',
          summary: null,
          updatedAt: 500,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:3',
          tool: 'codex',
          backendId: 'thread-3',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project-b',
          title: 'Other project',
          summary: null,
          updatedAt: 200,
        },
      },
    ]);

    const codexProjects = sections.find((section) => section.tool === 'codex')?.projects ?? [];

    expect(codexProjects).toHaveLength(3);
    expect(codexProjects[0]).toMatchObject({
      title: 'server',
      projectPath: '/Users/test/project-a/packages/server',
      threadCount: 1,
      liveThreadCount: 0,
    });
    expect(codexProjects[0]?.primaryItem.title).toBe('Refactor server');
    expect(codexProjects[1]).toMatchObject({
      title: 'app',
      projectPath: '/Users/test/project-a/packages/app',
      threadCount: 1,
      liveThreadCount: 1,
    });
    expect(codexProjects[1]?.primaryItem.title).toBe('Fix app shell');
    expect(codexProjects[2]).toMatchObject({
      title: 'project-b',
      projectPath: '/Users/test/project-b',
      threadCount: 1,
      liveThreadCount: 0,
    });
  });

  it('uses the parent directory name when the working directory ends in a generic project folder', () => {
    const claudeProjects = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:1',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claudeapp/environments/data/envs/merry-grove/project',
          projectRoot: '/Users/test/claudeapp',
          title: 'Fix happy path',
          summary: null,
          updatedAt: 300,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:2',
          tool: 'claude',
          backendId: 'claude-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claudeapp/environments/data/envs/swift-island/project',
          projectRoot: '/Users/test/claudeapp',
          title: 'Audit loading state',
          summary: null,
          updatedAt: 200,
        },
      },
    ]).find((section) => section.tool === 'claude')?.projects ?? [];

    expect(claudeProjects).toHaveLength(2);
    expect(claudeProjects[0]).toMatchObject({
      title: 'merry-grove',
      projectPath: '/Users/test/claudeapp/environments/data/envs/merry-grove/project',
    });
    expect(claudeProjects[1]).toMatchObject({
      title: 'swift-island',
      projectPath: '/Users/test/claudeapp/environments/data/envs/swift-island/project',
    });
  });
});

describe('pickPreferredCliThreadTool', () => {
  it('keeps an explicit preferred tool even when another tool is newer', () => {
    const sections = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:1',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude',
          title: 'Claude',
          summary: null,
          updatedAt: 100,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:1',
          tool: 'codex',
          backendId: 'codex-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/codex',
          title: 'Codex',
          summary: null,
          updatedAt: 500,
        },
      },
    ]);

    expect(pickPreferredCliThreadTool(sections, 'claude')).toBe('claude');
  });

  it('defaults to the tool with the most recently active thread', () => {
    const sections = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'gemini:1',
          tool: 'gemini',
          backendId: 'gemini-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/gemini',
          title: 'Gemini',
          summary: null,
          updatedAt: 900,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:1',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude',
          title: 'Claude',
          summary: null,
          updatedAt: 100,
        },
      },
    ]);

    expect(pickPreferredCliThreadTool(sections, null)).toBe('gemini');
  });
});

describe('current project scope', () => {
  it('prefers a live project as the current project for a tool', () => {
    const codexSection = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:1',
          tool: 'codex',
          backendId: 'codex-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/older-project',
          title: 'Older thread',
          summary: null,
          updatedAt: 500,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:2',
          tool: 'codex',
          backendId: 'codex-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/live-project',
          title: 'Live thread',
          summary: null,
          updatedAt: 400,
          isLive: true,
        },
      },
    ]).find((section) => section.tool === 'codex');

    expect(codexSection).toBeDefined();
    expect(pickCurrentCliThreadProject(codexSection!)).toMatchObject({
      title: 'live-project',
      projectPath: '/Users/test/live-project',
      liveThreadCount: 1,
    });
  });

  it('falls back to the newest project when there is no live project', () => {
    const claudeSection = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:1',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/newest-project',
          title: 'Newest thread',
          summary: null,
          updatedAt: 900,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:2',
          tool: 'claude',
          backendId: 'claude-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/older-project',
          title: 'Older thread',
          summary: null,
          updatedAt: 400,
        },
      },
    ]).find((section) => section.tool === 'claude');

    expect(claudeSection).toBeDefined();
    expect(pickCurrentCliThreadProject(claudeSection!)).toMatchObject({
      title: 'newest-project',
      projectPath: '/Users/test/newest-project',
    });
  });

  it('filters a tool section to only the current project when scoped', () => {
    const geminiSection = buildCliThreadToolSections([
      {
        type: 'native-cli-session',
        entry: {
          id: 'gemini:1',
          tool: 'gemini',
          backendId: 'gemini-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project-a',
          title: 'Project A thread',
          summary: null,
          updatedAt: 900,
        },
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'gemini:2',
          tool: 'gemini',
          backendId: 'gemini-2',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/project-b',
          title: 'Project B thread',
          summary: null,
          updatedAt: 400,
        },
      },
    ]).find((section) => section.tool === 'gemini');

    expect(geminiSection).toBeDefined();

    const scoped = getCliThreadScopedProjects(geminiSection!, 'current-project');
    const allProjects = getCliThreadScopedProjects(geminiSection!, 'all-projects');

    expect(scoped.projectCount).toBe(1);
    expect(scoped.threadCount).toBe(1);
    expect(scoped.projects[0]).toMatchObject({
      title: 'project-a',
      projectPath: '/Users/test/project-a',
    });
    expect(allProjects.projectCount).toBe(2);
    expect(allProjects.threadCount).toBe(2);
  });
});

describe('formatCliThreadUpdatedAt', () => {
  it('formats recent timestamps consistently', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    expect(formatCliThreadUpdatedAt(9_500)).toBe('just now');
    expect(formatCliThreadUpdatedAt(1_000)).toBe('just now');

    vi.setSystemTime(70_000);
    expect(formatCliThreadUpdatedAt(10_000)).toBe('1m ago');

    vi.setSystemTime(7_210_000);
    expect(formatCliThreadUpdatedAt(10_000)).toBe('2h ago');

    vi.useRealTimers();
  });
});
