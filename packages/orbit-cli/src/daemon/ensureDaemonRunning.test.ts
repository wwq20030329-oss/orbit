import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockLoggerDebug: vi.fn(),
  mockIsDaemonRunningCurrentlyInstalledHappyVersion: vi.fn(),
  mockCheckIfDaemonRunningAndCleanupStaleState: vi.fn(),
  mockSpawnHappyCLI: vi.fn(),
  mockInstallDaemonLaunchAgent: vi.fn(),
  mockIsLaunchAgentCurrent: vi.fn(),
}))

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: mocks.mockLoggerDebug,
  },
}))

vi.mock('./controlClient', () => ({
  isDaemonRunningCurrentlyInstalledOrbitVersion: mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion,
  checkIfDaemonRunningAndCleanupStaleState: mocks.mockCheckIfDaemonRunningAndCleanupStaleState,
}))

vi.mock('@/utils/spawnOrbitCLI', () => ({
  spawnOrbitCLI: mocks.mockSpawnHappyCLI,
}))

vi.mock('./install', () => ({
  install: mocks.mockInstallDaemonLaunchAgent,
}))

vi.mock('./mac/install', () => ({
  isLaunchAgentCurrent: mocks.mockIsLaunchAgentCurrent,
}))

import { ensureDaemonRunning } from './ensureDaemonRunning'

describe('ensureDaemonRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true)
    mocks.mockSpawnHappyCLI.mockReturnValue({
      unref: vi.fn(),
    })
    mocks.mockInstallDaemonLaunchAgent.mockResolvedValue(undefined)
    mocks.mockIsLaunchAgentCurrent.mockReturnValue(true)
  })

  it('returns without spawning when the daemon is already running', async () => {
    mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion.mockResolvedValue(true)

    await ensureDaemonRunning()

    expect(mocks.mockSpawnHappyCLI).not.toHaveBeenCalled()
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith(
      'Ensuring Orbit background service is running and matches our version...',
    )
  })

  it('reinstalls the LaunchAgent when the daemon is already running but the config is outdated', async () => {
    mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion.mockResolvedValue(true)
    mocks.mockIsLaunchAgentCurrent.mockReturnValue(false)

    await ensureDaemonRunning()

    expect(mocks.mockInstallDaemonLaunchAgent).toHaveBeenCalledTimes(1)
    expect(mocks.mockSpawnHappyCLI).not.toHaveBeenCalled()
  })

  it('starts the daemon when the installed version is not running', async () => {
    const mockUnref = vi.fn()
    mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion.mockResolvedValue(false)
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    mocks.mockSpawnHappyCLI.mockReturnValue({
      unref: mockUnref,
    })

    await ensureDaemonRunning()

    expect(mocks.mockSpawnHappyCLI).toHaveBeenCalledWith(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    expect(mockUnref).toHaveBeenCalled()
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith('Starting Orbit background service...')
  })

  it('reinstalls the LaunchAgent after starting the daemon when the config is outdated', async () => {
    const mockUnref = vi.fn()
    mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion.mockResolvedValue(false)
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    mocks.mockSpawnHappyCLI.mockReturnValue({
      unref: mockUnref,
    })
    mocks.mockIsLaunchAgentCurrent.mockReturnValue(false)

    await ensureDaemonRunning()

    expect(mockUnref).toHaveBeenCalled()
    expect(mocks.mockInstallDaemonLaunchAgent).toHaveBeenCalledTimes(1)
  })

  it('throws when the daemon does not come online after spawning', async () => {
    mocks.mockIsDaemonRunningCurrentlyInstalledHappyVersion.mockResolvedValue(false)
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState.mockResolvedValue(false)

    await expect(ensureDaemonRunning()).rejects.toThrow('Failed to start Orbit background service')
  }, 10000)
})
