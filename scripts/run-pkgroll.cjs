#!/usr/bin/env node

const path = require('node:path');
const { runCliWithSystemNodeFallback } = require('./system-node-runner.cjs');

const args = process.argv.slice(2);
const pkgrollCli = path.resolve(
  path.dirname(require.resolve('pkgroll/package.json', { paths: [process.cwd()] })),
  'dist/cli.mjs',
);

runCliWithSystemNodeFallback({
  wrapperEnvVar: 'ORBIT_PKGROLL_WRAPPED',
  entryFile: __filename,
  cliArgs: args,
  targetScript: pkgrollCli,
});
