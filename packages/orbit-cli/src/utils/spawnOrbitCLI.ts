/**
 * Cross-platform Orbit CLI spawning utility.
 */

import { spawn, SpawnOptions, type ChildProcess } from 'child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { projectPath } from '@/projectPath';
import { logger } from '@/ui/logger';

import { isBun } from './runtime';

export function spawnOrbitCLI(args: string[], options: SpawnOptions = {}): ChildProcess {
  const projectRoot = projectPath();
  const entrypoint = join(projectRoot, 'dist', 'index.mjs');

  let directory: string | URL | undefined;
  if ('cwd' in options) {
    directory = options.cwd;
  } else {
    directory = process.cwd();
  }

  const fullCommand = `orbit ${args.join(' ')}`;
  logger.debug(`[SPAWN ORBIT CLI] Spawning: ${fullCommand} in ${directory}`);

  const nodeArgs = [
    '--no-warnings',
    '--no-deprecation',
    entrypoint,
    ...args,
  ];

  if (!existsSync(entrypoint)) {
    const errorMessage = `Entrypoint ${entrypoint} does not exist`;
    logger.debug(`[SPAWN ORBIT CLI] ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const runtime = isBun() ? 'bun' : 'node';
  return spawn(runtime, nodeArgs, {
    windowsHide: true,
    ...options,
  });
}
