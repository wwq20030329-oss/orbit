import { logger } from '@/ui/logger'
import { isDaemonRunningCurrentlyInstalledOrbitVersion } from './controlClient'
import { spawnOrbitCLI } from '@/utils/spawnOrbitCLI'

export async function ensureDaemonRunning(): Promise<void> {
  logger.debug('Ensuring Orbit background service is running and matches our version...')

  if (await isDaemonRunningCurrentlyInstalledOrbitVersion()) {
    return
  }

  logger.debug('Starting Orbit background service...')

  const daemonProcess = spawnOrbitCLI(['daemon', 'start-sync'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  daemonProcess.unref()

  // Give daemon a moment to write PID & port file before first notification.
  await new Promise(resolve => setTimeout(resolve, 200))
}
