import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Machine, NativeCliHistoryEntry } from '@/sync/storageTypes';

const hoisted = vi.hoisted(() => ({
  state: {
    nativeCliHistoryByMachine: {} as Record<string, NativeCliHistoryEntry[]>,
    machines: {} as Record<string, Machine>,
  },
  getRememberedNativeCliResumeRequest: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
  storage: {
    getState: () => hoisted.state,
  },
}));

vi.mock('@/utils/openNativeCliSession', () => ({
  getRememberedNativeCliResumeRequest: hoisted.getRememberedNativeCliResumeRequest,
}));

import { getSessionRoutePlaceholder } from './sessionRoutePlaceholder';

describe('getSessionRoutePlaceholder', () => {
  beforeEach(() => {
    hoisted.state.nativeCliHistoryByMachine = {};
    hoisted.state.machines = {};
    hoisted.getRememberedNativeCliResumeRequest.mockReset();
    hoisted.getRememberedNativeCliResumeRequest.mockReturnValue(null);
  });

  it('builds a placeholder from cached native history entries', () => {
    hoisted.state.nativeCliHistoryByMachine = {
      'machine-1': [{
        id: 'codex:thread-1',
        tool: 'codex',
        backendId: 'thread-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/project',
        projectRoot: '/Users/test/project',
        title: 'project',
        summary: null,
        updatedAt: 1,
        isLive: false,
      }],
    };
    hoisted.state.machines = {
      'machine-1': {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
          host: 'test-mac',
          platform: 'darwin',
          orbitCliVersion: '1.0.0',
          orbitHomeDir: '/Users/test/.orbit',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
      },
    };

    expect(getSessionRoutePlaceholder('codex:thread-1')).toEqual({
      title: 'project',
      subtitle: '~/project',
      previewText: 'project',
      flavor: 'codex',
    });
  });

  it('falls back to remembered resume requests when no cached entry is present', () => {
    hoisted.state.machines = {
      'machine-7': {
        id: 'machine-7',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
          host: 'test-mac',
          platform: 'darwin',
          orbitCliVersion: '1.0.0',
          orbitHomeDir: '/Users/test/.orbit',
          homeDir: '/Users/test',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 0,
      },
    };
    hoisted.getRememberedNativeCliResumeRequest.mockReturnValue({
      machineId: 'machine-7',
      tool: 'claude',
      backendId: 'backend-1',
      workingDirectory: '/Users/test/worktrees/feature-a',
      title: 'feature-a',
      summary: null,
      updatedAt: 1,
    });

    expect(getSessionRoutePlaceholder('placeholder-session')).toEqual({
      title: 'feature-a',
      subtitle: '~/worktrees/feature-a',
      previewText: 'feature-a',
      flavor: 'claude',
    });
  });

  it('returns null when no cached or remembered context exists', () => {
    expect(getSessionRoutePlaceholder('missing')).toBeNull();
  });
});
