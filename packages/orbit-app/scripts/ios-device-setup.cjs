const path = require('path');
const { spawnSync } = require('child_process');
const { syncIosDebugMetroConfig } = require('./ios-sync-debug-metro-config.cjs');

const projectRoot = path.resolve(__dirname, '..');
const workspacePath = path.join(projectRoot, 'ios', 'Orbitdev.xcworkspace');
const { lanIp } = syncIosDebugMetroConfig();
console.log('');
console.log('Next steps in Xcode:');
console.log('1. Select your connected iPhone as the run target.');
console.log('2. Signing & Capabilities -> Team: choose your Apple ID Personal Team.');
console.log('3. If bundle ID conflicts, change it to something unique like com.<yourname>.orbit.dev.');
console.log('4. Press Run once; after the first run, enable Developer Mode on the iPhone if prompted.');

spawnSync('open', [workspacePath], { stdio: 'inherit' });
