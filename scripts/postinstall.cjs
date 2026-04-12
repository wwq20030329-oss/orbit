const { execSync } = require('child_process');

// Apply patches to node_modules
require('../patches/fix-pglite-prisma-bytes.cjs');

if (process.env.SKIP_ORBIT_WIRE_BUILD === '1' || process.env.SKIP_HAPPY_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_ORBIT_WIRE_BUILD=1, skipping @orbit/wire build');
  process.exit(0);
}

execSync('yarn workspace @orbit/wire build', {
  stdio: 'inherit',
});
