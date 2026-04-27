import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveProjectRoot } from './projectRoot';

describe('resolveProjectRoot', () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('returns the git repository root for nested directories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'orbit-project-root-'));
    createdDirs.push(rootDir);

    await mkdir(join(rootDir, '.git'), { recursive: true });
    const nestedDir = join(rootDir, 'packages', 'orbit-app', 'sources');
    await mkdir(nestedDir, { recursive: true });

    expect(resolveProjectRoot(nestedDir)).toBe(rootDir);
  });

  it('returns the worktree root for nested worktree directories', async () => {
    const repoDir = await mkdtemp(join(tmpdir(), 'orbit-worktree-root-'));
    createdDirs.push(repoDir);

    const nestedWorktreeDir = join(repoDir, '.dev', 'worktree', 'feature-a', 'packages', 'orbit-cli');
    await mkdir(nestedWorktreeDir, { recursive: true });

    expect(resolveProjectRoot(nestedWorktreeDir)).toBe(join(repoDir, '.dev', 'worktree', 'feature-a'));
  });

  it('falls back to the highest workspace-like marker when no git root exists', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'orbit-workspace-root-'));
    createdDirs.push(rootDir);

    await writeFile(join(rootDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n', 'utf8');
    const nestedDir = join(rootDir, 'packages', 'orbit-agent');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, 'package.json'), '{"name":"orbit-agent"}', 'utf8');

    expect(resolveProjectRoot(nestedDir)).toBe(rootDir);
  });
});
