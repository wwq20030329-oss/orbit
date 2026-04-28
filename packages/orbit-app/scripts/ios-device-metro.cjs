const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');
const { syncIosDebugMetroConfig } = require('./ios-sync-debug-metro-config.cjs');

const projectRoot = path.resolve(__dirname, '..');
const { lanIp, serverUrl } = syncIosDebugMetroConfig();
const METRO_PORT = 8081;

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(1500, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

function listPortPids(port) {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) {
      return [];
    }
    return output
      .split('\n')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
}

function readPidCommand(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function looksLikeOrbitMetro(command) {
  return command.includes(projectRoot) && command.includes('expo start');
}

function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
}

async function ensureHealthyMetroPort() {
  try {
    const response = await request(`http://127.0.0.1:${METRO_PORT}`);
    const isHealthy = response.statusCode >= 200
      && response.statusCode < 500
      && !response.body.includes('EPERM')
      && !response.body.includes('Cannot read JSON file');

    if (isHealthy) {
      console.log(`Metro is already healthy on port ${METRO_PORT}; reusing it.`);
      return 'reused';
    }

    console.warn(`Existing Metro on port ${METRO_PORT} is unhealthy (HTTP ${response.statusCode}). Restarting it.`);
  } catch {
    return 'start';
  }

  const pids = listPortPids(METRO_PORT);
  const matchingPids = pids.filter((pid) => looksLikeOrbitMetro(readPidCommand(pid)));

  if (matchingPids.length === 0) {
    throw new Error(`Port ${METRO_PORT} is occupied by another process. Free the port and retry.`);
  }

  for (const pid of matchingPids) {
    console.log(`Stopping stale Metro process ${pid}...`);
    killPid(pid);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  return 'start';
}

if (!lanIp) {
  console.error('Unable to determine a LAN IP address for Metro.');
  process.exit(1);
}

console.log(`Starting Metro for device debugging on ${lanIp}:${METRO_PORT}`);
console.log(`Using Orbit server: ${serverUrl}`);

(async () => {
  try {
    const action = await ensureHealthyMetroPort();
    if (action === 'reused') {
      process.exit(0);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const child = spawn(
    'npx',
    ['expo', 'start', '--dev-client', '--host', 'lan'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        APP_ENV: 'development',
        EXPO_PACKAGER_HOSTNAME: lanIp,
        EXPO_PUBLIC_SERVER_URL: serverUrl,
        EXPO_PUBLIC_ORBIT_SERVER_URL: serverUrl,
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
})();
