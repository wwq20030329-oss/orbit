import { logger } from '@/ui/logger'
import { checkIfDaemonRunningAndCleanupStaleState, isDaemonRunningCurrentlyInstalledOrbitVersion } from './controlClient'
import { spawnOrbitCLI } from '@/utils/spawnOrbitCLI'
import { install as installDaemonLaunchAgent } from './install'
import { isLaunchAgentCurrent } from './mac/install'

export async function ensureDaemonRunning(): Promise<void> {
  logger.debug('Ensuring Orbit background service is running and matches our version...')

  const daemonAlreadyRunning = await isDaemonRunningCurrentlyInstalledOrbitVersion()
  if (daemonAlreadyRunning) {
    if (!isLaunchAgentCurrent()) {
      try {
        await installDaemonLaunchAgent()
      } catch (error) {
        logger.debug('Failed to install Orbit daemon LaunchAgent:', error)
      }
    }
    return
  }

  logger.debug('Starting Orbit background service...')

  const daemonProcess = spawnOrbitCLI(['daemon', 'start-sync'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  daemonProcess.unref()

  for (let attempt = 0; attempt < 50; attempt++) {
    if (await checkIfDaemonRunningAndCleanupStaleState()) {
      if (!isLaunchAgentCurrent()) {
        try {
          await installDaemonLaunchAgent()
        } catch (error) {
          logger.debug('Failed to install Orbit daemon LaunchAgent:', error)
        }
      }
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error('Failed to start Orbit background service')
}
