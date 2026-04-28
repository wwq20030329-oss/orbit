import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockReadCredentials: vi.fn(),
  mockClearCredentials: vi.fn(),
  mockClearMachineId: vi.fn(),
  mockReadSettings: vi.fn(),
  mockAuthAndSetupMachineIfNeeded: vi.fn(),
  mockStopDaemon: vi.fn(),
  mockEnsureDaemonRunning: vi.fn(),
  mockLoggerDebug: vi.fn(),
}))

vi.mock('@/persistence', () => ({
  readCredentials: mocks.mockReadCredentials,
  clearCredentials: mocks.mockClearCredentials,
  clearMachineId: mocks.mockClearMachineId,
  readSettings: mocks.mockReadSettings,
}))

vi.mock('@/ui/auth', () => ({
  authAndSetupMachineIfNeeded: mocks.mockAuthAndSetupMachineIfNeeded,
}))

vi.mock('@/daemon/controlClient', () => ({
  stopDaemon: mocks.mockStopDaemon,
}))

vi.mock('@/daemon/ensureDaemonRunning', () => ({
  ensureDaemonRunning: mocks.mockEnsureDaemonRunning,
}))

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: mocks.mockLoggerDebug,
  },
}))

import { handleAuthCommand } from './auth'

describe('handleAuthCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockReadCredentials.mockResolvedValue(null)
    mocks.mockReadSettings.mockResolvedValue(null)
    mocks.mockAuthAndSetupMachineIfNeeded.mockResolvedValue({
      credentials: { token: 'token' },
      machineId: 'machine-123',
    })
    mocks.mockEnsureDaemonRunning.mockResolvedValue(undefined)
    mocks.mockStopDaemon.mockResolvedValue(undefined)
  })

  it('starts the daemon after a successful login', async () => {
    await handleAuthCommand(['login'])

    expect(mocks.mockAuthAndSetupMachineIfNeeded).toHaveBeenCalledTimes(1)
    expect(mocks.mockEnsureDaemonRunning).toHaveBeenCalledTimes(1)
    expect(
      mocks.mockAuthAndSetupMachineIfNeeded.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.mockEnsureDaemonRunning.mock.invocationCallOrder[0])
  })

  it('ensures the daemon is running when already authenticated', async () => {
    mocks.mockReadCredentials.mockResolvedValue({ token: 'token' })
    mocks.mockReadSettings.mockResolvedValue({ machineId: 'machine-123' })

    await handleAuthCommand(['login'])

    expect(mocks.mockAuthAndSetupMachineIfNeeded).not.toHaveBeenCalled()
    expect(mocks.mockEnsureDaemonRunning).toHaveBeenCalledTimes(1)
  })
})
