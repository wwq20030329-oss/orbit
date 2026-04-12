import { describe, expect, it } from 'vitest';

import type { SessionListViewItem } from '@/sync/storage';
import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';

import { appendNativeCliHistoryToSessionList } from './nativeCliHistory';

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

describe('appendNativeCliHistoryToSessionList', () => {
  it('shows Local CLI History near the top when there are no active sessions', () => {
    const baseItems: SessionListViewItem[] = [
      { type: 'header', title: 'Today' },
    ];

    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'gemini:1',
        tool: 'gemini',
        backendId: 'gemini-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/gemini-project',
        title: 'Gemini launch checklist',
        summary: null,
        updatedAt: 300,
      },
      {
        id: 'claude:1',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: 'Claude refactor history',
        summary: 'Claude refactor history',
        updatedAt: 100,
      },
    ];

    expect(appendNativeCliHistoryToSessionList(baseItems, entries, machinesById)).toEqual([
      { type: 'header', title: 'Claude History' },
      {
        type: 'native-cli-project-group',
        tool: 'claude',
        machine,
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
      },
      { type: 'native-cli-session', entry: entries[1] },
      { type: 'header', title: 'Gemini History' },
      {
        type: 'native-cli-project-group',
        tool: 'gemini',
        machine,
        title: 'gemini-project',
        subtitle: '~/gemini-project · Mac mini',
      },
      { type: 'native-cli-session', entry: entries[0] },
      { type: 'header', title: 'Today' },
    ]);
  });

  it('keeps active sessions first and inserts Local CLI History right after them', () => {
    const activeSessions = [
      {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online' as const,
      },
    ];

    const baseItems: SessionListViewItem[] = [
      { type: 'active-sessions', sessions: activeSessions },
      { type: 'header', title: 'Today' },
    ];

    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'codex:1',
        tool: 'codex',
        backendId: 'codex-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/codex-project',
        title: 'Codex resume target',
        summary: null,
        updatedAt: 200,
      },
    ];

    expect(appendNativeCliHistoryToSessionList(baseItems, entries, machinesById)).toEqual([
      { type: 'active-sessions', sessions: activeSessions },
      { type: 'header', title: 'Codex History' },
      {
        type: 'native-cli-project-group',
        tool: 'codex',
        machine,
        title: 'codex-project',
        subtitle: '~/codex-project · Mac mini',
      },
      { type: 'native-cli-session', entry: entries[0] },
      { type: 'header', title: 'Today' },
    ]);
  });

  it('returns the original list when no native history exists', () => {
    const baseItems: SessionListViewItem[] = [{ type: 'header', title: 'Today' }];

    expect(appendNativeCliHistoryToSessionList(baseItems, [], machinesById)).toEqual(baseItems);
  });

  it('groups multiple history items from the same project together inside one project section', () => {
    const entries: NativeCliHistoryEntry[] = [
      {
        id: 'claude:2',
        tool: 'claude',
        backendId: 'claude-2',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: 'Newest thread',
        summary: null,
        updatedAt: 500,
      },
      {
        id: 'claude:1',
        tool: 'claude',
        backendId: 'claude-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/claude-project',
        title: 'Older thread',
        summary: null,
        updatedAt: 100,
      },
    ];

    expect(appendNativeCliHistoryToSessionList([], entries, machinesById)).toEqual([
      { type: 'header', title: 'Claude History' },
      {
        type: 'native-cli-project-group',
        tool: 'claude',
        machine,
        title: 'claude-project',
        subtitle: '~/claude-project · Mac mini',
      },
      { type: 'native-cli-session', entry: entries[0] },
      { type: 'native-cli-session', entry: entries[1] },
    ]);
  });
});
