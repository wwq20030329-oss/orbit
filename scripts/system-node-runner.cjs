const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

function isCodexDesktopNode() {
  return process.platform === 'darwin'
    && process.execPath.includes('/Applications/Codex.app/');
}

function resolveSystemNode() {
  const candidates = [
    process.env.ORBIT_SYSTEM_NODE,
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate !== process.execPath && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function runNodeProcess(nodeBinary, cliArgs, extraEnv = {}) {
  const result = spawnSync(nodeBinary, cliArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function runCliWithSystemNodeFallback(options) {
  const {
    wrapperEnvVar,
    entryFile,
    cliArgs,
    targetScript,
  } = options;

  if (isCodexDesktopNode() && process.env[wrapperEnvVar] !== '1') {
    const systemNode = resolveSystemNode();

    if (systemNode) {
      runNodeProcess(systemNode, [entryFile, ...cliArgs], {
        [wrapperEnvVar]: '1',
      });
      return;
    }
  }

  runNodeProcess(process.execPath, [targetScript, ...cliArgs]);
}

module.exports = {
  runCliWithSystemNodeFallback,
};
