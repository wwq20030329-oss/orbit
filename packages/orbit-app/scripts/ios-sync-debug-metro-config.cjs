const fs = require('fs');
const path = require('path');
const { resolveLanIp } = require('./ios-lan-ip.cjs');

function syncIosDebugMetroConfig(options = {}) {
  const { silent = false, writeSwift = false } = options;
  const projectRoot = path.resolve(__dirname, '..');
  const xcodeEnvLocalPath = path.join(projectRoot, 'ios', '.xcode.env.local');
  const debugMetroConfigPath = path.join(projectRoot, 'ios', 'Orbitdev', 'DebugMetroConfig.swift');
  const lanIp = resolveLanIp();
  const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ||
    process.env.EXPO_PUBLIC_ORBIT_SERVER_URL ||
    'https://api.2003383.xyz';

  const envLines = [
    `export NODE_BINARY=${process.execPath}`,
    `export EXPO_PUBLIC_SERVER_URL=${serverUrl}`,
    `export EXPO_PUBLIC_ORBIT_SERVER_URL=${serverUrl}`,
  ];

  if (lanIp) {
    envLines.push(`export EXPO_PACKAGER_HOSTNAME=${lanIp}`);
  }

  fs.writeFileSync(xcodeEnvLocalPath, `${envLines.join('\n')}\n`, 'utf8');
  if (writeSwift) {
    fs.writeFileSync(
      debugMetroConfigPath,
      `enum DebugMetroConfig {\n  static let metroHost: String? = ${lanIp ? `"${lanIp}"` : 'nil'}\n  static let serverUrl = "${serverUrl}"\n}\n`,
      'utf8',
    );
  }

  if (!silent) {
    console.log(`Updated ${xcodeEnvLocalPath}`);
    if (writeSwift) {
      console.log(`Updated ${debugMetroConfigPath}`);
    }
    console.log(`LAN host: ${lanIp ?? 'not found'}`);
  }

  return {
    lanIp,
    serverUrl,
    xcodeEnvLocalPath,
    debugMetroConfigPath,
  };
}

if (require.main === module) {
  const silent = process.argv.includes('--silent');
  const writeSwift = process.argv.includes('--write-swift');
  syncIosDebugMetroConfig({ silent, writeSwift });
}

module.exports = {
  syncIosDebugMetroConfig,
};
