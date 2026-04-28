import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearDaemonState: vi.fn(),
  loggerDebug: vi.fn(),
  projectPath: vi.fn(),
  readDaemonState: vi.fn(),
}));

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
  },
}));

vi.mock('@/persistence', () => ({
  clearDaemonState: mocks.clearDaemonState,
  readDaemonState: mocks.readDaemonState,
}));

vi.mock('@/projectPath', () => ({
  projectPath: mocks.projectPath,
}));

import { listDaemonSessions, spawnDaemonSession } from './controlClient';

describe('controlClient', () => {
  const fetchMock = vi.fn();
  const killMock = vi.spyOn(process, 'kill');
  const abortTimeoutMock = vi.spyOn(AbortSignal, 'timeout');

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.readDaemonState.mockResolvedValue({
      pid: 1234,
      httpPort: 4510,
    });
    mocks.projectPath.mockReturnValue('/tmp/orbit');
    killMock.mockImplementation(() => true);
    abortTimeoutMock.mockImplementation((timeout) => {
      const controller = new AbortController();
      controller.abort(`timeout:${timeout}`);
      return controller.signal;
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ children: [], success: true, sessionId: 'session-123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    delete process.env.ORBIT_DAEMON_HTTP_TIMEOUT;
  });

  it('uses the standard daemon HTTP timeout for lightweight requests', async () => {
    await listDaemonSessions();

    expect(abortTimeoutMock).toHaveBeenCalledWith(10_000);
  });

  it('uses a longer timeout for spawn-session requests', async () => {
    await spawnDaemonSession('/tmp/project');

    expect(abortTimeoutMock).toHaveBeenCalledWith(20_000);
  });

  it('respects the explicit daemon HTTP timeout override for spawn-session requests', async () => {
    process.env.ORBIT_DAEMON_HTTP_TIMEOUT = '4321';

    await spawnDaemonSession('/tmp/project');

    expect(abortTimeoutMock).toHaveBeenCalledWith(4321);
  });
});
