import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { buildLaunchAgentPlist, collectLaunchAgentEnv, getLaunchAgentPlistPath, isLaunchAgentCurrent, LAUNCH_AGENT_LABEL, resolveLaunchAgentScriptPath } from './install';

describe('mac launch agent install', () => {
  it('writes the LaunchAgent plist into the current user Library directory', () => {
    expect(getLaunchAgentPlistPath('/Users/test')).toBe(
      '/Users/test/Library/LaunchAgents/com.orbit-cli.daemon.plist',
    );
  });

  it('includes the daemon command and selected environment variables in the plist', () => {
    const plist = buildLaunchAgentPlist({
      orbitPath: '/usr/local/bin/node',
      scriptPath: '/tmp/orbit/dist/index.mjs',
      homeDir: '/Users/test',
      env: {
        ORBIT_SERVER_URL: 'https://api.2003383.xyz',
        ORBIT_HOME_DIR: '/Users/test/.orbit',
        HOME: '/Users/test',
        PATH: '/Users/test/.local/bin:/opt/homebrew/bin:/usr/bin:/bin',
      },
    });

    expect(plist).toContain(`<string>${LAUNCH_AGENT_LABEL}</string>`);
    expect(plist).toContain('<string>/usr/local/bin/node</string>');
    expect(plist).toContain('<string>/tmp/orbit/dist/index.mjs</string>');
    expect(plist).toContain('<string>daemon</string>');
    expect(plist).toContain('<string>start-sync</string>');
    expect(plist).toContain('<key>ORBIT_SERVER_URL</key>');
    expect(plist).toContain('<string>https://api.2003383.xyz</string>');
    expect(plist).toContain('<key>ORBIT_HOME_DIR</key>');
    expect(plist).toContain('<string>/Users/test/.orbit</string>');
    expect(plist).toContain('<key>PATH</key>');
    expect(plist).toContain('/Users/test/.local/bin');
    expect(plist).toContain('/opt/homebrew/bin');
    expect(plist).toContain(path.join('/Users/test', '.orbit', 'daemon.log'));
    expect(plist).toContain(path.join('/Users/test', '.orbit', 'daemon.err'));
  });

  it('rewrites the legacy VPS url to the canonical Orbit API domain before writing the plist', () => {
    const env = collectLaunchAgentEnv({
      ORBIT_SERVER_URL: 'http://192.227.228.53:3005',
      PATH: '/usr/bin:/bin',
    }, '/Users/test');

    expect(env.ORBIT_SERVER_URL).toBe('https://api.2003383.xyz');
  });

  it('treats a plist without the reconciled PATH as outdated', () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), 'orbit-launch-agent-test-'));
    const currentPath = getLaunchAgentPlistPath(homeDir);
    const legacyPlist = buildLaunchAgentPlist({
      orbitPath: '/usr/local/bin/node',
      scriptPath: '/tmp/orbit/dist/index.mjs',
      homeDir,
      env: {
        ORBIT_SERVER_URL: 'https://api.2003383.xyz',
        HOME: homeDir,
      },
    }).replace(/<key>PATH<\/key>[\s\S]*?<string>[^<]*<\/string>\s*/m, '');

    mkdirSync(path.dirname(currentPath), { recursive: true });
    writeFileSync(currentPath, legacyPlist);

    expect(isLaunchAgentCurrent({
      homeDir,
      orbitPath: '/usr/local/bin/node',
      scriptPath: '/tmp/orbit/dist/index.mjs',
      env: {
        PATH: '/usr/bin:/bin',
        ORBIT_SERVER_URL: 'https://api.2003383.xyz',
      },
    })).toBe(false);
  });

  it('normalizes a dist entrypoint to the wrapper script when present', () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), 'orbit-launch-agent-test-'));
    const packageRoot = path.join(homeDir, 'orbit-cli');
    const binDir = path.join(packageRoot, 'bin');
    const distDir = path.join(packageRoot, 'dist');

    mkdirSync(binDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    writeFileSync(path.join(binDir, 'orbit.mjs'), '#!/usr/bin/env node\n');

    const wrapperScript = path.join(binDir, 'orbit.mjs');
    const distScript = path.join(distDir, 'index.mjs');

    expect(resolveLaunchAgentScriptPath(distScript)).toBe(wrapperScript);
  });
});
