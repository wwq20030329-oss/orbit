import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

import { logger } from '@/ui/logger';
import { trimIdent } from '@/utils/trimIdent';
import { resolveOrbitServerUrl } from '@/utils/serverUrl';

export const LAUNCH_AGENT_LABEL = 'com.orbit-cli.daemon';

function getLaunchAgentsDir(homeDir: string = os.homedir()): string {
  return path.join(homeDir, 'Library', 'LaunchAgents');
}

export function getLaunchAgentPlistPath(homeDir: string = os.homedir()): string {
  return path.join(getLaunchAgentsDir(homeDir), `${LAUNCH_AGENT_LABEL}.plist`);
}

export function resolveLaunchAgentScriptPath(currentScriptPath: string | undefined): string | undefined {
  if (!currentScriptPath) {
    return currentScriptPath;
  }

  const normalized = path.normalize(currentScriptPath);
  if (normalized.includes(`${path.sep}dist${path.sep}`)) {
    const packageRoot = path.dirname(path.dirname(normalized));
    const wrapperCandidate = path.join(packageRoot, 'bin', 'orbit.mjs');
    if (existsSync(wrapperCandidate)) {
      return wrapperCandidate;
    }
  }

  return currentScriptPath;
}

function buildLaunchAgentPath(env: NodeJS.ProcessEnv, homeDir: string = os.homedir()): string {
  const shellPathEntries = (env.PATH ?? '')
    .split(':')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const preferredEntries = [
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.npm', 'bin'),
    path.join(homeDir, '.yarn', 'bin'),
    path.join(homeDir, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];

  return [...new Set([...shellPathEntries, ...preferredEntries])].join(':');
}

export function collectLaunchAgentEnv(env: NodeJS.ProcessEnv, homeDir: string = os.homedir()): Record<string, string> {
  const keys = [
    'ORBIT_HOME_DIR',
    'DANGEROUSLY_LOG_TO_SERVER',
    'DEBUG',
  ] as const;

  const collected = Object.fromEntries(
    keys
      .map((key) => [key, env[key]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  collected.ORBIT_SERVER_URL = resolveOrbitServerUrl(env.ORBIT_SERVER_URL);
  collected.HOME = homeDir;
  collected.PATH = buildLaunchAgentPath(env, homeDir);

  return collected;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildLaunchAgentPlist(options: {
  orbitPath: string;
  scriptPath: string;
  env?: Record<string, string>;
  homeDir?: string;
}): string {
  const { orbitPath, scriptPath, env = {}, homeDir = os.homedir() } = options;

  const envBlock = Object.entries(env)
    .map(([key, value]) => trimIdent(`
      <key>${xmlEscape(key)}</key>
      <string>${xmlEscape(value)}</string>
    `))
    .join('\n');

  return trimIdent(`
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>Label</key>
      <string>${LAUNCH_AGENT_LABEL}</string>

      <key>ProgramArguments</key>
      <array>
        <string>${xmlEscape(orbitPath)}</string>
        <string>${xmlEscape(scriptPath)}</string>
        <string>daemon</string>
        <string>start-sync</string>
      </array>

      <key>EnvironmentVariables</key>
      <dict>
        <key>ORBIT_DAEMON_MODE</key>
        <string>true</string>
        ${envBlock}
      </dict>

      <key>RunAtLoad</key>
      <true/>

      <key>KeepAlive</key>
      <true/>

      <key>StandardErrorPath</key>
      <string>${xmlEscape(path.join(homeDir, '.orbit', 'daemon.err'))}</string>

      <key>StandardOutPath</key>
      <string>${xmlEscape(path.join(homeDir, '.orbit', 'daemon.log'))}</string>

      <key>WorkingDirectory</key>
      <string>/tmp</string>
    </dict>
    </plist>
  `);
}

export function isLaunchAgentInstalled(homeDir: string = os.homedir()): boolean {
  return existsSync(getLaunchAgentPlistPath(homeDir));
}

export function isLaunchAgentCurrent(options?: {
  orbitPath?: string;
  scriptPath?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}): boolean {
  const homeDir = options?.homeDir ?? os.homedir();
  const plistPath = getLaunchAgentPlistPath(homeDir);
  if (!existsSync(plistPath)) {
    return false;
  }

  const orbitPath = options?.orbitPath ?? process.execPath;
  const scriptPath = resolveLaunchAgentScriptPath(options?.scriptPath ?? process.argv[1]);
  if (!orbitPath || !scriptPath) {
    return false;
  }

  const expected = buildLaunchAgentPlist({
    orbitPath,
    scriptPath,
    env: collectLaunchAgentEnv(options?.env ?? process.env, homeDir),
    homeDir,
  });

  return readFileSync(plistPath, 'utf8') === expected;
}

export async function install(): Promise<void> {
  const homeDir = os.homedir();
  const plistDir = getLaunchAgentsDir(homeDir);
  const plistPath = getLaunchAgentPlistPath(homeDir);
  const orbitPath = process.execPath;
  const scriptPath = resolveLaunchAgentScriptPath(process.argv[1]);
  if (!scriptPath) {
    throw new Error('Unable to resolve Orbit CLI script path for LaunchAgent installation');
  }
  const envVars = collectLaunchAgentEnv(process.env, homeDir);
  const plistContent = buildLaunchAgentPlist({
    orbitPath,
    scriptPath,
    env: envVars,
    homeDir,
  });

  mkdirSync(plistDir, { recursive: true });

  const currentContent = existsSync(plistPath) ? readFileSync(plistPath, 'utf8') : null;
  if (currentContent !== plistContent) {
    writeFileSync(plistPath, plistContent);
    chmodSync(plistPath, 0o644);
    logger.info(`Updated Orbit daemon LaunchAgent at ${plistPath}`);
  }

  const uid = process.getuid?.();
  if (uid == null) {
    throw new Error('Unable to determine current user ID for LaunchAgent installation');
  }

  try {
    execFileSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
  } catch {
    // Ignore when the agent is not loaded yet.
  }

  try {
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'ignore' });
    execFileSync('launchctl', ['enable', `gui/${uid}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
    execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
  } catch (error) {
    logger.debug('Failed to bootstrap LaunchAgent, falling back to launchctl load:', error);
    execFileSync('launchctl', ['load', '-w', plistPath], { stdio: 'ignore' });
  }

  logger.info('Orbit daemon LaunchAgent is installed and running');
}
