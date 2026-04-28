#!/usr/bin/env node

const { existsSync, mkdirSync } = require('node:fs');
const { basename, dirname, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const [command = 'help', ...restArgs] = process.argv.slice(2);

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(stderr || `git ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result.stdout ?? '';
}

function getRepoRoot() {
  return runGit(['rev-parse', '--show-toplevel'], { capture: true }).trim();
}

function getCurrentBranch() {
  return runGit(['branch', '--show-current'], { capture: true }).trim();
}

function getDefaultWorktreeRoot(repoRoot) {
  return join(dirname(repoRoot), `${basename(repoRoot)}-worktrees`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/worktree.cjs list
  node scripts/worktree.cjs create <name> [branch]
  node scripts/worktree.cjs remove <name-or-path>
  node scripts/worktree.cjs prune

Notes:
  - create defaults branch to codex/<name>
  - worktrees live under ../${basename(process.cwd())}-worktrees by default
  - remove accepts either a short worktree name or a full path
`);
}

function listWorktrees() {
  runGit(['worktree', 'list']);
}

function createWorktree(name, branchArg) {
  if (!name) {
    throw new Error('Missing worktree name.');
  }

  const repoRoot = getRepoRoot();
  const currentBranch = getCurrentBranch();
  const worktreeRoot = getDefaultWorktreeRoot(repoRoot);
  const targetPath = resolve(worktreeRoot, name);
  const branch = branchArg || `codex/${name}`;

  if (existsSync(targetPath)) {
    throw new Error(`Worktree path already exists: ${targetPath}`);
  }

  mkdirSync(worktreeRoot, { recursive: true });

  const existingBranches = runGit(['branch', '--list', branch], { capture: true })
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^\*\s*/, ''))
    .filter(Boolean);

  const args = ['worktree', 'add'];
  if (existingBranches.includes(branch)) {
    args.push(targetPath, branch);
  } else {
    args.push('-b', branch, targetPath, currentBranch);
  }

  runGit(args);
  console.log(`Created worktree:
  path: ${targetPath}
  branch: ${branch}`);
}

function resolveRemovalPath(input) {
  const repoRoot = getRepoRoot();
  const worktreeRoot = getDefaultWorktreeRoot(repoRoot);
  const candidatePath = input.includes('/') ? resolve(input) : resolve(worktreeRoot, input);
  return candidatePath;
}

function removeWorktree(input) {
  if (!input) {
    throw new Error('Missing worktree name or path.');
  }

  const targetPath = resolveRemovalPath(input);
  runGit(['worktree', 'remove', targetPath]);
  console.log(`Removed worktree: ${targetPath}`);
}

function pruneWorktrees() {
  runGit(['worktree', 'prune']);
}

try {
  switch (command) {
    case 'list':
      listWorktrees();
      break;
    case 'create':
      createWorktree(restArgs[0], restArgs[1]);
      break;
    case 'remove':
      removeWorktree(restArgs[0]);
      break;
    case 'prune':
      pruneWorktrees();
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[worktree] ${message}`);
  process.exit(1);
}
