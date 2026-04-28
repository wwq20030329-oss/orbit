import { beforeEach, describe, expect, it, vi } from 'vitest';

const { psListMock } = vi.hoisted(() => ({
  psListMock: vi.fn(),
}));

vi.mock('ps-list', () => ({
  default: psListMock,
}));

import {
  findDuplicateDaemonSpawnedSessionProcesses,
  findOrphanDaemonSpawnedSessionProcesses,
} from './doctor';

describe('findDuplicateDaemonSpawnedSessionProcesses', () => {
  beforeEach(() => {
    psListMock.mockReset();
  });

  it('keeps the newest healthy daemon-spawned resume process and returns older duplicates', async () => {
    psListMock.mockResolvedValue([
      {
        pid: 100,
        ppid: 1,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume same-session',
      },
      {
        pid: 200,
        ppid: 99,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume same-session',
      },
      {
        pid: 300,
        ppid: 77,
        name: 'node',
        cmd: 'node dist/index.mjs codex --started-by daemon --resume another-session',
      },
    ]);

    await expect(findDuplicateDaemonSpawnedSessionProcesses()).resolves.toEqual([
      {
        pid: 100,
        ppid: 1,
        command: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume same-session',
      },
    ]);
  });

  it('ignores daemon-spawned sessions that do not share a resume target', async () => {
    psListMock.mockResolvedValue([
      {
        pid: 100,
        ppid: 1,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume first-session',
      },
      {
        pid: 200,
        ppid: 1,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume second-session',
      },
    ]);

    await expect(findDuplicateDaemonSpawnedSessionProcesses()).resolves.toEqual([]);
  });

  it('finds orphaned daemon-spawned sessions whose parent process is gone', async () => {
    psListMock.mockResolvedValue([
      {
        pid: 100,
        ppid: 1,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume orphan-session',
      },
      {
        pid: 200,
        ppid: 99,
        name: 'node',
        cmd: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume healthy-session',
      },
    ]);

    await expect(findOrphanDaemonSpawnedSessionProcesses()).resolves.toEqual([
      {
        pid: 100,
        ppid: 1,
        command: 'node dist/index.mjs claude --orbit-starting-mode remote --started-by daemon --resume orphan-session',
      },
    ]);
  });
});
