import { execSync } from 'child_process';
import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface CLIAvailability {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  openclaw: boolean;
  detectedAt: number;
}

/**
 * Detects which CLI tools are available on this machine.
 * Cross-platform: uses `command -v` on POSIX, `Get-Command` on Windows.
 */
export function detectCLIAvailability(): CLIAvailability {
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    return detectWindows();
  }
  return detectPosix();
}

function commandExists(command: string): boolean {
  try {
    execSync(`command -v ${command} >/dev/null 2>&1`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectPosix(): CLIAvailability {
  // Claude availability should reflect whether the binary is installed.
  // Gateway/model compatibility is a separate concern and should not make
  // the UI claim Claude is "not found" when it is present on disk.
  const claude = commandExists('claude');
  const codex = commandExists('codex');
  const gemini = commandExists('gemini');

  // OpenClaw: check command, config file, or env var
  const openclawCommand = commandExists('openclaw');
  const openclawConfig = existsSync(join(os.homedir(), '.openclaw', 'openclaw.json'));
  const openclawEnv = !!process.env.OPENCLAW_GATEWAY_URL;
  const openclaw = openclawCommand || openclawConfig || openclawEnv;

  return { claude, codex, gemini, openclaw, detectedAt: Date.now() };
}

function detectWindows(): CLIAvailability {
  const checkCommand = (name: string): boolean => {
    try {
      execSync(`powershell -NoProfile -Command "Get-Command ${name} -ErrorAction SilentlyContinue"`, { stdio: 'ignore', windowsHide: true });
      return true;
    } catch {
      return false;
    }
  };

  const claude = checkCommand('claude');
  const codex = checkCommand('codex');
  const gemini = checkCommand('gemini');

  // OpenClaw: check command, config file, or env var
  const openclawCommand = checkCommand('openclaw');
  const openclawConfig = existsSync(join(process.env.USERPROFILE || os.homedir(), '.openclaw', 'openclaw.json'));
  const openclawEnv = !!process.env.OPENCLAW_GATEWAY_URL;
  const openclaw = openclawCommand || openclawConfig || openclawEnv;

  return { claude, codex, gemini, openclaw, detectedAt: Date.now() };
}

type ClaudeSettingsEnv = {
  ANTHROPIC_BASE_URL?: unknown;
  ANTHROPIC_MODEL?: unknown;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: unknown;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: unknown;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: unknown;
};

function isLocalGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  } catch {
    return false;
  }
}

function looksLikeForeignClaudeModel(value: string): boolean {
  return /(longcat|gpt|codex)/i.test(value);
}

export function hasProblematicClaudeGatewayConfig(homeDir: string = os.homedir()): boolean {
  const settingsPath = join(homeDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as { env?: ClaudeSettingsEnv };
    const env = parsed.env;
    if (!env || typeof env !== 'object') {
      return false;
    }

    const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : null;
    if (baseUrl && isLocalGatewayUrl(baseUrl)) {
      return true;
    }

    const configuredModels = [
      env.ANTHROPIC_MODEL,
      env.ANTHROPIC_DEFAULT_OPUS_MODEL,
      env.ANTHROPIC_DEFAULT_SONNET_MODEL,
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    ].filter((value): value is string => typeof value === 'string');

    return configuredModels.some(looksLikeForeignClaudeModel);
  } catch {
    return false;
  }
}
