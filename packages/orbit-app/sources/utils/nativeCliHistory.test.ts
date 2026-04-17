import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

import type { Message } from '@/sync/typesMessage';
vi.mock('@/utils/worktree', () => ({
  WORKTREE_PATH_MARKER: '/.dev/worktree/',
  getRepoPath: (path: string) => path,
  getWorktreeName: () => null,
  isWorktreePath: () => false,
}));

import {
  buildCliSessionListViewData,
  findExistingOrbitSessionIdForNativeEntry,
  findMatchingNativeCliEntryForSession,
  findReusableOrbitSessionIdForNativeEntry,
  getNativeCliEntryStatusPresentation,
  getSessionDisplayTitle,
  shouldReuseExistingOrbitSessionForNativeEntry,
} from './nativeCliHistory';

const machine: Machine = {
  id: 'machine-1',
  seq: 1,
  createdAt: 1,
  updatedAt: 1,
  active: true,
  activeAt: 1,
  metadata: {
    host: 'wwq-mac',
    platform: 'darwin',
    orbitCliVersion: '1.0.0',
    homeDir: '/Users/test',
    orbitHomeDir: '/Users/test/.orbit',
    displayName: 'Mac mini',
  },
  metadataVersion: 1,
  daemonState: null,
  daemonStateVersion: 0,
};

const machinesById: Record<string, Machine> = {
  [machine.id]: machine,
};

function createSession(overrides: Partial<Session> & Pick<Session, 'id' | 'updatedAt' | 'active' | 'activeAt' | 'presence'>): Session {
  const {
    id,
    updatedAt,
    active,
    activeAt,
    presence,
    ...rest
  } = overrides;

  return {
    id,
    seq: 1,
    createdAt: 1,
    updatedAt,
    active,
    activeAt,
    metadata: null,
    metadataVersion: 0,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence,
    ...rest,
  };
}

describe('buildCliSessionListViewData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups Orbit sessions and native CLI history by tool, then by project', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-session',
        updatedAt: 900,
        active: true,
        activeAt: 900,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-1',
          flavor: 'claude',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'codex-session-new',
        updatedAt: 800,
        active: true,
        activeAt: 800,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-1',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'codex-session-old',
        updatedAt: 700,
        active: false,
        activeAt: 700,
        presence: 700,
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-2',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'gemini:1',
        tool: 'gemini',
        backendId: 'gemini-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/gemini-project',
        title: 'Gemini rollout',
        summary: null,
        updatedAt: 600,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries,
      allEntries: entries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'claude', title: 'Claude', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'claude',
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
        groupKey: 'machine-1:/Users/test/claude-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:session:claude-session',
          tool: 'claude',
          backendId: 'claude-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude-project',
          projectRoot: undefined,
          title: 'claude-project',
          summary: null,
          updatedAt: 900,
          isLive: true,
        },
        displayTitle: 'claude-project',
        displaySubtitle: 'ID claude-1 · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
      { type: 'cli-section', tool: 'codex', title: 'Codex', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'codex',
        title: 'codex-project',
        subtitle: '~/codex-project · Mac mini',
        groupKey: 'machine-1:/Users/test/codex-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:session:codex-session-new',
          tool: 'codex',
          backendId: 'codex-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/codex-project',
          projectRoot: undefined,
          title: 'codex-project',
          summary: null,
          updatedAt: 800,
          isLive: true,
        },
        displayTitle: 'codex-project',
        displaySubtitle: 'ID codex-1 · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
      { type: 'cli-section', tool: 'gemini', title: 'Gemini', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'gemini',
        title: 'gemini-project',
        subtitle: '~/gemini-project · Mac mini',
        groupKey: 'machine-1:/Users/test/gemini-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: entries[0],
        displayTitle: 'Gemini rollout',
        displaySubtitle: 'ID gemini-1 · just now',
        badgeLabel: 'History',
        badgeTone: 'history',
      },
    ]);
  });

  it('keeps a tool section collapsed when requested', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-session',
        updatedAt: 100,
        active: true,
        activeAt: 100,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-1',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: { codex: true },
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'codex', title: 'Codex', count: 1, projectCount: 1, expanded: false },
    ]);
  });

  it('groups multiple projects inside the same tool by most recent activity', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-session-b',
        updatedAt: 200,
        active: true,
        activeAt: 200,
        presence: 'online',
        metadata: {
          path: '/Users/test/project-b',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-b',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'codex-session-a',
        updatedAt: 500,
        active: true,
        activeAt: 500,
        presence: 'online',
        metadata: {
          path: '/Users/test/project-a',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-a',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    const items = buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    });

    expect(items[1]).toEqual({
      type: 'cli-project-group',
      tool: 'codex',
      title: 'project-a',
      subtitle: '~/project-a · Mac mini',
      groupKey: 'machine-1:/Users/test/project-a',
      count: 1,
      expanded: true,
    });
    expect(items[3]).toEqual({
      type: 'cli-project-group',
      tool: 'codex',
      title: 'project-b',
      subtitle: '~/project-b · Mac mini',
      groupKey: 'machine-1:/Users/test/project-b',
      count: 1,
      expanded: true,
    });
  });

  it('groups nested package sessions under the shared project root when provided', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-session-app',
        updatedAt: 500,
        active: true,
        activeAt: 500,
        presence: 'online',
        metadata: {
          path: '/Users/test/claudeapp/packages/orbit-app',
          projectRoot: '/Users/test/claudeapp',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-app',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'codex-session-cli',
        updatedAt: 400,
        active: true,
        activeAt: 400,
        presence: 'online',
        metadata: {
          path: '/Users/test/claudeapp/packages/orbit-cli',
          projectRoot: '/Users/test/claudeapp',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-cli',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    const items = buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    });

    expect(items).toContainEqual({
      type: 'cli-project-group',
      tool: 'codex',
      title: 'claudeapp',
      subtitle: '~/claudeapp · Mac mini',
      groupKey: 'machine-1:/Users/test/claudeapp',
      count: 2,
      expanded: true,
    });
  });

  it('falls back to stable session labels when the source title is only a trivial greeting', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-session',
        updatedAt: 900,
        active: true,
        activeAt: 900,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-1',
          flavor: 'claude',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    const allEntries: NativeCliHistoryEntry[] = [
      {
        id: 'claude:1',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: 'hello',
        summary: null,
        updatedAt: 850,
        isLive: true,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })[2]).toEqual({
      type: 'native-cli-session',
      entry: {
        id: 'claude:session:claude-session',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        projectRoot: undefined,
        title: 'claude-project',
        summary: null,
        updatedAt: 900,
        isLive: true,
      },
      displayTitle: 'claude-project',
      displaySubtitle: 'ID claude-1 · just now',
      badgeLabel: 'Live',
      badgeTone: 'live',
    });
  });

  it('reuses native CLI titles on matching Orbit sessions', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-session',
        updatedAt: 900,
        active: true,
        activeAt: 900,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-1',
          flavor: 'claude',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    const allEntries: NativeCliHistoryEntry[] = [
      {
        id: 'claude:1',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: '为什么终端授权成功后还是看不到设备',
        summary: null,
        updatedAt: 950,
        isLive: true,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })[2]).toEqual({
      type: 'native-cli-session',
      entry: {
        id: 'claude:session:claude-session',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        projectRoot: undefined,
        title: 'claude-project',
        summary: null,
        updatedAt: 900,
        isLive: true,
      },
      displayTitle: 'claude-project',
      displaySubtitle: 'ID claude-1 · just now',
      badgeLabel: 'Live',
      badgeTone: 'live',
    });
  });

  it('keeps project groups collapsed when requested', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-session',
        updatedAt: 200,
        active: true,
        activeAt: 200,
        presence: 'online',
        metadata: {
          path: '/Users/test/project-a',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-a',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {
        'codex:machine-1:/Users/test/project-a': true,
      },
    })).toEqual([
      { type: 'cli-section', tool: 'codex', title: 'Codex', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'codex',
        title: 'project-a',
        subtitle: '~/project-a · Mac mini',
        groupKey: 'machine-1:/Users/test/project-a',
        count: 1,
        expanded: false,
      },
    ]);
  });

  it('hides stale daemon-only CLI sessions without a recoverable native source', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-user-session',
        updatedAt: 900,
        active: true,
        activeAt: 900,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-user',
          flavor: 'codex',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'codex-daemon-stale',
        updatedAt: 700,
        active: false,
        activeAt: 700,
        presence: 700,
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-subagent',
          flavor: 'codex',
          homeDir: '/Users/test',
          startedBy: 'daemon',
          startedFromDaemon: true,
          lifecycleState: 'done',
        },
        metadataVersion: 1,
      }),
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'codex', title: 'Codex', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'codex',
        title: 'codex-project',
        subtitle: '~/codex-project · Mac mini',
        groupKey: 'machine-1:/Users/test/codex-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'codex:session:codex-user-session',
          tool: 'codex',
          backendId: 'codex-user',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/codex-project',
          projectRoot: undefined,
          title: 'codex-project',
          summary: null,
          updatedAt: 900,
          isLive: true,
        },
        displayTitle: 'codex-project',
        displaySubtitle: 'ID codex-us · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
    ]);
  });

  it('deduplicates Orbit sessions that point to the same backend conversation', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-user-session',
        updatedAt: 950,
        active: true,
        activeAt: 950,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-duplicate',
          flavor: 'claude',
          homeDir: '/Users/test',
          startedBy: 'terminal',
        },
        metadataVersion: 1,
      }),
      createSession({
        id: 'claude-daemon-mirror',
        updatedAt: 980,
        active: true,
        activeAt: 980,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-duplicate',
          flavor: 'claude',
          homeDir: '/Users/test',
          startedBy: 'daemon',
          startedFromDaemon: true,
          sessionRole: 'native-live-mirror',
          lifecycleState: 'running',
        },
        metadataVersion: 1,
      }),
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'claude', title: 'Claude', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'claude',
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
        groupKey: 'machine-1:/Users/test/claude-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: {
          id: 'claude:session:claude-user-session',
          tool: 'claude',
          backendId: 'claude-duplicate',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude-project',
          projectRoot: undefined,
          title: 'claude-project',
          summary: null,
          updatedAt: 950,
          isLive: true,
        },
        displayTitle: 'claude-project',
        displaySubtitle: 'ID claude-d · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
    ]);
  });

  it('keeps native live entries visible when the only Orbit match is an internal mirror session', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-daemon-mirror',
        updatedAt: 980,
        active: true,
        activeAt: 980,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-live',
          flavor: 'claude',
          homeDir: '/Users/test',
          startedBy: 'daemon',
          startedFromDaemon: true,
          sessionRole: 'native-live-mirror',
          lifecycleState: 'running',
        },
        metadataVersion: 1,
      }),
    ];

    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'claude:live',
        tool: 'claude',
        backendId: 'claude-live',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: '继续做 Orbit 会话同步',
        summary: null,
        updatedAt: 990,
        isLive: true,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries,
      allEntries: entries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'claude', title: 'Claude', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'claude',
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
        groupKey: 'machine-1:/Users/test/claude-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: entries[0],
        displayTitle: '继续做 Orbit 会话同步',
        displaySubtitle: 'ID claude-l · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
    ]);
  });

  it('hides online daemon-only shell sessions that have no imported history or meaningful title', () => {
    const sessions: Session[] = [
      createSession({
        id: 'claude-daemon-shell',
        updatedAt: 980,
        active: true,
        activeAt: 980,
        presence: 'online',
        metadata: {
          path: '/Users/test/claude-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-shell',
          flavor: 'claude',
          homeDir: '/Users/test',
          startedBy: 'daemon',
          startedFromDaemon: true,
          lifecycleState: 'running',
        },
        metadataVersion: 1,
      }),
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries: [],
      allEntries: [],
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([]);
  });

  it('treats imported native history wrappers as the native CLI entry instead of a separate Orbit session row', () => {
    const sessions: Session[] = [
      createSession({
        id: 'codex-imported-wrapper',
        updatedAt: 980,
        active: true,
        activeAt: 980,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          projectRoot: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          flavor: 'codex',
          homeDir: '/Users/test',
          startedBy: 'daemon',
          startedFromDaemon: true,
          nativeHistorySourceTool: 'codex',
          nativeHistorySourceBackendId: 'codex-imported-1',
          nativeHistoryImportedAt: 970,
          summary: {
            text: '继续优化会话同步',
            updatedAt: 980,
          },
        },
        metadataVersion: 1,
      }),
    ];

    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'codex:history-1',
        tool: 'codex',
        backendId: 'codex-imported-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/codex-project',
        projectRoot: '/Users/test/codex-project',
        title: '继续优化会话同步',
        summary: null,
        updatedAt: 975,
        isLive: true,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions,
      entries,
      allEntries: entries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'codex', title: 'Codex', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'codex',
        title: 'codex-project',
        subtitle: '~/codex-project · Mac mini',
        groupKey: 'machine-1:/Users/test/codex-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: entries[0],
        displayTitle: '继续优化会话同步',
        displaySubtitle: 'ID codex-im · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
    ]);
  });

  it('falls back to the project name when a native entry title is just a greeting prompt', () => {
    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'claude:hello',
        tool: 'claude',
        backendId: 'claude-hello',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: 'hello can you help me fix this',
        summary: null,
        updatedAt: 990,
        isLive: true,
      },
    ];

    expect(buildCliSessionListViewData({
      sessions: [],
      entries,
      allEntries: entries,
      machinesById,
      collapsedSections: {},
      collapsedProjectGroups: {},
    })).toEqual([
      { type: 'cli-section', tool: 'claude', title: 'Claude', count: 1, projectCount: 1, expanded: true },
      {
        type: 'cli-project-group',
        tool: 'claude',
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
        groupKey: 'machine-1:/Users/test/claude-project',
        count: 1,
        expanded: true,
      },
      {
        type: 'native-cli-session',
        entry: entries[0],
        displayTitle: 'claude-project',
        displaySubtitle: 'ID claude-h · just now',
        badgeLabel: 'Live',
        badgeTone: 'live',
      },
    ]);
  });
});

describe('session display helpers', () => {
  it('matches imported native history entries for wrapper sessions', () => {
    const session = createSession({
      id: 'wrapper-session',
      updatedAt: 900,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/claude-project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        nativeHistorySourceTool: 'claude',
        nativeHistorySourceBackendId: 'claude-backend-1',
        flavor: 'claude',
        homeDir: '/Users/test',
      },
      metadataVersion: 1,
    });

    const entry: NativeCliHistoryEntry = {
      id: 'claude-entry',
      tool: 'claude',
      backendId: 'claude-backend-1',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/claude-project',
      title: 'Fix sync bug',
      summary: 'Investigating Orbit session state',
      updatedAt: 950,
      isLive: true,
    };

    expect(
      findMatchingNativeCliEntryForSession(session, {
        [machine.id]: [entry],
      }),
    ).toEqual(entry);
  });

  it('prefers a matched native history title over generic session fallbacks', () => {
    const session = createSession({
      id: 'wrapper-session',
      updatedAt: 900,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/claude-project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        nativeHistorySourceTool: 'claude',
        nativeHistorySourceBackendId: 'claude-backend-1',
        flavor: 'claude',
        homeDir: '/Users/test',
      },
      metadataVersion: 1,
    });

    expect(
      getSessionDisplayTitle(session, {
        [machine.id]: [{
          id: 'claude-entry',
          tool: 'claude',
          backendId: 'claude-backend-1',
          machineId: 'machine-1',
          workingDirectory: '/Users/test/claude-project',
          title: 'Fix sync bug',
          summary: null,
          updatedAt: 950,
          isLive: true,
        }],
      }),
    ).toBe('Fix sync bug');
  });

  it('falls back to project and backend labels instead of unknown', () => {
    const withProjectRoot = createSession({
      id: 'project-root-session',
      updatedAt: 900,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '',
        host: 'wwq-mac',
        machineId: 'machine-1',
        projectRoot: '/Users/test/claudeapp',
        flavor: 'claude',
      },
      metadataVersion: 1,
    });

    const withBackendOnly = createSession({
      id: 'backend-session',
      updatedAt: 900,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '',
        host: 'wwq-mac',
        machineId: 'machine-1',
        claudeSessionId: '12345678-abcdef',
        flavor: 'claude',
      },
      metadataVersion: 1,
    });

    expect(getSessionDisplayTitle(withProjectRoot)).toBe('claudeapp');
    expect(getSessionDisplayTitle(withBackendOnly)).toBe('Claude Session · 12345678');
  });

  it('ignores greeting-style summary titles and falls back to the project name', () => {
    const session = createSession({
      id: 'hello-summary-session',
      updatedAt: 900,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/claude-project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        claudeSessionId: 'claude-123',
        flavor: 'claude',
        summary: {
          text: 'hello can you help me fix this',
          updatedAt: 900,
        },
      },
      metadataVersion: 1,
    });

    expect(getSessionDisplayTitle(session)).toBe('claude-project');
  });

  it('marks offline native CLI history entries as history-only in the list presentation', () => {
    expect(getNativeCliEntryStatusPresentation({ isLive: false }, 'wwq-mac')).toEqual({
      text: 'History on wwq-mac',
      color: '#8E8E93',
      isPulsing: false,
      isConnected: false,
    });
  });

  it('marks live native CLI history entries as connected in the list presentation', () => {
    expect(getNativeCliEntryStatusPresentation({ isLive: true }, 'wwq-mac')).toEqual({
      text: 'Live on wwq-mac',
      color: '#34C759',
      isPulsing: true,
      isConnected: true,
    });
  });
});

describe('shouldReuseExistingOrbitSessionForNativeEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const entry: NativeCliHistoryEntry = {
    id: 'codex:thread-1',
    tool: 'codex',
    backendId: 'thread-1',
    machineId: 'machine-1',
    workingDirectory: '/Users/test/project',
    title: 'Debug current issue',
    summary: null,
    updatedAt: 100,
    isLive: false,
  };

  it('does not reuse an empty shell session with only agent events', () => {
    const session = createSession({
      id: 'orbit-shell',
      updatedAt: 100,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
      },
      metadataVersion: 1,
    });

    const messages: Message[] = [{
      kind: 'agent-event',
      id: 'event-1',
      createdAt: 100,
      event: { type: 'ready' } as any,
    }];

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, messages)).toBe(false);
  });

  it('does not reuse an offline session that only has imported native history metadata', () => {
    const session = createSession({
      id: 'orbit-imported',
      updatedAt: 100,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-1',
        nativeHistoryImportedAt: 123,
      },
      metadataVersion: 1,
    });

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, [])).toBe(false);
  });

  it('reuses an online daemon session once imported native history is ready', () => {
    const session = createSession({
      id: 'orbit-imported-live',
      updatedAt: 100,
      active: true,
      activeAt: 100,
      presence: 'online',
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
        startedBy: 'daemon',
        startedFromDaemon: true,
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-1',
        nativeHistoryImportedAt: 123,
      },
      metadataVersion: 1,
    });

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, [])).toBe(true);
  });

  it('does not reuse an imported daemon session when the CLI history is newer than the last import', () => {
    const newerEntry: NativeCliHistoryEntry = {
      ...entry,
      updatedAt: 300,
    };

    const session = createSession({
      id: 'orbit-imported-stale',
      updatedAt: 200,
      active: true,
      activeAt: 200,
      presence: 'online',
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
        startedBy: 'daemon',
        startedFromDaemon: true,
        nativeHistorySourceTool: 'codex',
        nativeHistorySourceBackendId: 'thread-1',
        nativeHistoryImportedAt: 150,
      },
      metadataVersion: 1,
    });

    expect(shouldReuseExistingOrbitSessionForNativeEntry(newerEntry, session, [])).toBe(false);
  });

  it('does not reuse an offline session even when real user messages already exist', () => {
    const session = createSession({
      id: 'orbit-with-history',
      updatedAt: 100,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
      },
      metadataVersion: 1,
    });

    const messages: Message[] = [{
      kind: 'user-text',
      id: 'user-1',
      localId: null,
      createdAt: 100,
      text: 'hello',
    }];

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, messages)).toBe(false);
  });

  it('reuses an online user-started session immediately', () => {
    const session = createSession({
      id: 'orbit-user-live',
      updatedAt: 100,
      active: true,
      activeAt: 100,
      presence: 'online',
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
        startedBy: 'terminal',
      },
      metadataVersion: 1,
    });

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, [])).toBe(true);
  });

  it('does not reuse an online daemon session before imported history or real messages arrive', () => {
    const session = createSession({
      id: 'orbit-daemon-shell',
      updatedAt: 100,
      active: true,
      activeAt: 100,
      presence: 'online',
      metadata: {
        path: '/Users/test/project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'thread-1',
        flavor: 'codex',
        homeDir: '/Users/test',
        startedBy: 'daemon',
        startedFromDaemon: true,
      },
      metadataVersion: 1,
    });

    expect(shouldReuseExistingOrbitSessionForNativeEntry(entry, session, [])).toBe(false);
  });
});

describe('findExistingOrbitSessionIdForNativeEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches an existing Orbit session for a native Codex entry', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:live-1',
      tool: 'codex',
      backendId: 'codex-thread-123',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/codex-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 400,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-1': createSession({
        id: 'session-1',
        updatedAt: 10,
        active: true,
        activeAt: 10,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-thread-123',
          flavor: 'codex',
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBe('session-1');
  });

  it('can still match imported native history wrapper sessions by backend id when offline lookup is allowed', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:history-1',
      tool: 'codex',
      backendId: 'codex-thread-imported',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/codex-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 400,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-imported': createSession({
        id: 'session-imported',
        updatedAt: 10,
        active: false,
        activeAt: 1,
        presence: 1,
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          flavor: 'codex',
          nativeHistorySourceTool: 'codex',
          nativeHistorySourceBackendId: 'codex-thread-imported',
          nativeHistoryImportedAt: 350,
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBe(null);
    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions, { allowOffline: true })).toBe('session-imported');
  });

  it('does not treat stale imported native history wrappers as attachable running sessions', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:history-stale',
      tool: 'codex',
      backendId: 'codex-thread-imported-stale',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/codex-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 400,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-imported': createSession({
        id: 'session-imported',
        updatedAt: 10,
        active: false,
        activeAt: 1,
        presence: 1,
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          flavor: 'codex',
          lifecycleState: 'running',
          nativeHistorySourceTool: 'codex',
          nativeHistorySourceBackendId: 'codex-thread-imported-stale',
          nativeHistoryImportedAt: 350,
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBeNull();
    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions, { allowOffline: true })).toBe('session-imported');
  });

  it('falls back to a unique backend match even when machine metadata is missing', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:live-2',
      tool: 'codex',
      backendId: 'codex-thread-456',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/codex-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 600,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-1': createSession({
        id: 'session-1',
        updatedAt: 10,
        active: true,
        activeAt: 10,
        presence: 'online',
        metadata: {
          path: '/Users/test/codex-project',
          host: 'wwq-mac',
          codexThreadId: 'codex-thread-456',
          flavor: 'codex',
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBe('session-1');
  });

  it('prefers the same working directory when multiple backend matches exist', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'claude:live-2',
      tool: 'claude',
      backendId: 'claude-session-456',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/current-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 700,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-older': createSession({
        id: 'session-older',
        updatedAt: 10,
        active: true,
        activeAt: 10,
        presence: 'online',
        metadata: {
          path: '/Users/test/other-project',
          host: 'wwq-mac',
          claudeSessionId: 'claude-session-456',
          flavor: 'claude',
        },
        metadataVersion: 1,
      }),
      'session-current': createSession({
        id: 'session-current',
        updatedAt: 9,
        active: true,
        activeAt: 9,
        presence: 'online',
        metadata: {
          path: '/Users/test/current-project',
          host: 'wwq-mac',
          claudeSessionId: 'claude-session-456',
          flavor: 'claude',
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBe('session-current');
  });

  it('does not reuse a stale offline Orbit shell when matching a native entry', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:live-stale',
      tool: 'codex',
      backendId: 'codex-thread-stale',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/current-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 700,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-stale': createSession({
        id: 'session-stale',
        updatedAt: 500,
        active: false,
        activeAt: 500,
        presence: 500,
        metadata: {
          path: '/Users/test/current-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          codexThreadId: 'codex-thread-stale',
          flavor: 'codex',
          startedBy: 'daemon',
          startedFromDaemon: true,
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBeNull();
  });

  it('can reuse an offline session when explicitly allowed', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:live-stale',
      tool: 'codex',
      backendId: 'codex-thread-stale',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/current-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 700,
      isLive: true,
    };

    const staleSession = createSession({
      id: 'session-stale',
      updatedAt: 500,
      active: false,
      activeAt: 500,
      presence: 500,
      metadata: {
        path: '/Users/test/current-project',
        host: 'wwq-mac',
        machineId: 'machine-1',
        codexThreadId: 'codex-thread-stale',
        flavor: 'codex',
        startedBy: 'daemon',
        startedFromDaemon: true,
      },
    });

    const sessions: Record<string, Session> = {
      'session-stale': staleSession,
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions, { allowOffline: true })).toBe('session-stale');
  });

  it('ignores internal mirror sessions when matching a native entry to an Orbit session', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'claude:live-3',
      tool: 'claude',
      backendId: 'claude-session-789',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/current-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 700,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-daemon': createSession({
        id: 'session-daemon',
        updatedAt: 40,
        active: true,
        activeAt: 40,
        presence: 'online',
        metadata: {
          path: '/Users/test/current-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-session-789',
          flavor: 'claude',
          startedBy: 'daemon',
          startedFromDaemon: true,
          sessionRole: 'native-live-mirror',
        },
        metadataVersion: 1,
      }),
      'session-user': createSession({
        id: 'session-user',
        updatedAt: 20,
        active: true,
        activeAt: 20,
        presence: 'online',
        metadata: {
          path: '/Users/test/current-project',
          host: 'wwq-mac',
          machineId: 'machine-1',
          claudeSessionId: 'claude-session-789',
          flavor: 'claude',
          startedBy: 'terminal',
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBe('session-user');
  });

  it('returns null for ambiguous backend matches when machine and path do not line up', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'claude:live-4',
      tool: 'claude',
      backendId: 'claude-session-999',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/current-project',
      title: 'Current rollout thread',
      summary: null,
      updatedAt: 700,
      isLive: true,
    };

    const sessions: Record<string, Session> = {
      'session-other-machine': createSession({
        id: 'session-other-machine',
        updatedAt: 40,
        active: true,
        activeAt: 40,
        presence: 'online',
        metadata: {
          path: '/Users/other/current-project',
          host: 'wwq-mac',
          machineId: 'machine-2',
          claudeSessionId: 'claude-session-999',
          flavor: 'claude',
          startedBy: 'terminal',
        },
        metadataVersion: 1,
      }),
      'session-other-path': createSession({
        id: 'session-other-path',
        updatedAt: 20,
        active: true,
        activeAt: 20,
        presence: 'online',
        metadata: {
          path: '/Users/test/unrelated-project',
          host: 'wwq-mac',
          machineId: 'machine-3',
          claudeSessionId: 'claude-session-999',
          flavor: 'claude',
          startedBy: 'terminal',
        },
        metadataVersion: 1,
      }),
    };

    expect(findExistingOrbitSessionIdForNativeEntry(entry, sessions)).toBeNull();
  });
});

describe('findReusableOrbitSessionIdForNativeEntry', () => {
  it('returns null for daemon-started wrapper sessions without imported history or loaded messages', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:thread-empty-wrapper',
      tool: 'codex',
      backendId: 'thread-empty-wrapper',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 100,
      isLive: false,
    };

    const session = createSession({
      id: 'wrapper-empty',
      updatedAt: 100,
      active: false,
      activeAt: 100,
      presence: 100,
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-empty-wrapper',
        path: '/Users/test/project',
        projectRoot: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
        startedBy: 'daemon',
      },
      metadataVersion: 1,
    });

    expect(findReusableOrbitSessionIdForNativeEntry(
      entry,
      { [session.id]: session },
      {},
      { allowOffline: true },
    )).toBeNull();
  });

  it('returns the matching session when it is safe to reuse', () => {
    const entry: NativeCliHistoryEntry = {
      id: 'codex:thread-reusable',
      tool: 'codex',
      backendId: 'thread-reusable',
      machineId: 'machine-1',
      workingDirectory: '/Users/test/project',
      projectRoot: '/Users/test/project',
      title: 'project',
      summary: null,
      updatedAt: 100,
      isLive: true,
    };

    const session = createSession({
      id: 'session-reusable',
      updatedAt: 100,
      active: true,
      activeAt: Date.now(),
      presence: 'online',
      metadata: {
        machineId: 'machine-1',
        codexThreadId: 'thread-reusable',
        path: '/Users/test/project',
        projectRoot: '/Users/test/project',
        host: 'wwq-mac',
        flavor: 'codex',
      },
      metadataVersion: 1,
    });

    expect(findReusableOrbitSessionIdForNativeEntry(
      entry,
      { [session.id]: session },
      { [session.id]: { messages: [] } },
    )).toBe('session-reusable');
  });
});
