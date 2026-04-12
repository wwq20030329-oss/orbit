/**
 * Global configuration for Orbit CLI.
 *
 * Orbit prefers ORBIT_* variables and ~/.orbit, but still honors legacy
 * HAPPY_* variables so existing local setups keep working during migration.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../package.json'

class Configuration {
  public readonly serverUrl: string
  public readonly webappUrl: string
  public readonly isDaemonProcess: boolean

  // Directories and paths (from persistence)
  public readonly orbitHomeDir: string
  public readonly logsDir: string
  public readonly settingsFile: string
  public readonly privateKeyFile: string
  public readonly daemonStateFile: string
  public readonly daemonLockFile: string
  public readonly currentCliVersion: string

  public readonly isExperimentalEnabled: boolean
  public readonly disableCaffeinate: boolean
  public readonly startupRequestTimeoutMs: number

  constructor() {
    // Server configuration - Orbit-first with legacy fallbacks.
    this.serverUrl = process.env.ORBIT_SERVER_URL || process.env.HAPPY_SERVER_URL || 'https://api.cluster-fluster.com'
    this.webappUrl =
      process.env.ORBIT_PUBLIC_APP_URL ||
      process.env.ORBIT_WEBAPP_URL ||
      process.env.HAPPY_WEBAPP_URL ||
      'https://app.orbit.engineering'

    // Check if we're running as daemon based on process args
    const args = process.argv.slice(2)
    this.isDaemonProcess = args.length >= 2 && args[0] === 'daemon' && (args[1] === 'start-sync')

    // Directory configuration - Orbit-first with legacy fallback.
    const configuredHomeDir = process.env.ORBIT_HOME_DIR || process.env.HAPPY_HOME_DIR
    if (configuredHomeDir) {
      const expandedPath = configuredHomeDir.replace(/^~/, homedir())
      this.orbitHomeDir = expandedPath
    } else {
      this.orbitHomeDir = join(homedir(), '.orbit')
    }

    this.logsDir = join(this.orbitHomeDir, 'logs')
    this.settingsFile = join(this.orbitHomeDir, 'settings.json')
    this.privateKeyFile = join(this.orbitHomeDir, 'access.key')
    this.daemonStateFile = join(this.orbitHomeDir, 'daemon.state.json')
    this.daemonLockFile = join(this.orbitHomeDir, 'daemon.state.json.lock')

    this.isExperimentalEnabled = ['true', '1', 'yes'].includes((process.env.ORBIT_EXPERIMENTAL || process.env.HAPPY_EXPERIMENTAL)?.toLowerCase() || '');
    this.disableCaffeinate = ['true', '1', 'yes'].includes((process.env.ORBIT_DISABLE_CAFFEINATE || process.env.HAPPY_DISABLE_CAFFEINATE)?.toLowerCase() || '');
    this.startupRequestTimeoutMs = Math.max(250, parseInt(process.env.ORBIT_STARTUP_TIMEOUT_MS || process.env.HAPPY_STARTUP_TIMEOUT_MS || '5000', 10) || 5000);

    this.currentCliVersion = packageJson.version

    // Visual indicator on CLI startup (only if not daemon process to avoid log clutter)
    const variant = process.env.ORBIT_VARIANT || process.env.HAPPY_VARIANT || 'stable'
    if (!this.isDaemonProcess && variant === 'dev') {
      console.log('\x1b[33m🔧 DEV MODE\x1b[0m - Data: ' + this.orbitHomeDir)
    }

    if (!existsSync(this.orbitHomeDir)) {
      mkdirSync(this.orbitHomeDir, { recursive: true })
    }
    // Ensure directories exist
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true })
    }
  }

}

export const configuration: Configuration = new Configuration()
