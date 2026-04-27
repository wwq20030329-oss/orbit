import { existsSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';

import { logger } from '@/ui/logger';

import { getLaunchAgentPlistPath, LAUNCH_AGENT_LABEL } from './install';

export async function uninstall(): Promise<void> {
  const homeDir = os.homedir();
  const plistPath = getLaunchAgentPlistPath(homeDir);

  if (!existsSync(plistPath)) {
    logger.info('Orbit daemon LaunchAgent not found. Nothing to uninstall.');
    return;
  }

  const uid = process.getuid?.();
  if (uid != null) {
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
    } catch {
      try {
        execFileSync('launchctl', ['disable', `gui/${uid}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
      } catch {
        // Ignore unload failures and continue cleanup.
      }
    }
  }

  unlinkSync(plistPath);
  logger.info(`Removed Orbit daemon LaunchAgent from ${plistPath}`);
}
