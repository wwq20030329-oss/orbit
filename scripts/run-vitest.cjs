#!/usr/bin/env node

const { runCliWithSystemNodeFallback } = require('./system-node-runner.cjs');

const args = process.argv.slice(2);
const vitestCli = require.resolve('vitest/vitest.mjs', {
  paths: [process.cwd()],
});

runCliWithSystemNodeFallback({
  wrapperEnvVar: 'ORBIT_VITEST_WRAPPED',
  entryFile: __filename,
  cliArgs: args,
  targetScript: vitestCli,
});
