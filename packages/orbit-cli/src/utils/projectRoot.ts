import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WORKTREE_PATH_MARKER = '/.dev/worktree/';

const VCS_ROOT_MARKERS = ['.git', '.hg', '.jj', '.svn'];
const PROJECT_ROOT_HINTS = [
  'pnpm-workspace.yaml',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'rush.json',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
];

export function resolveProjectRoot(workingDirectory: string): string {
  const normalizedPath = resolve(workingDirectory);
  const worktreeRoot = resolveWorktreeRoot(normalizedPath);
  if (worktreeRoot) {
    return worktreeRoot;
  }

  let currentPath = normalizedPath;
  let highestHintMatch: string | null = null;

  while (true) {
    if (hasAnyMarker(currentPath, VCS_ROOT_MARKERS)) {
      return currentPath;
    }

    if (hasAnyMarker(currentPath, PROJECT_ROOT_HINTS)) {
      highestHintMatch = currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  return highestHintMatch ?? normalizedPath;
}

function hasAnyMarker(path: string, markers: string[]): boolean {
  return markers.some((marker) => existsSync(join(path, marker)));
}

function resolveWorktreeRoot(path: string): string | null {
  const markerIndex = path.indexOf(WORKTREE_PATH_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = path.slice(markerIndex + WORKTREE_PATH_MARKER.length);
  const [worktreeName] = afterMarker.split('/');
  if (!worktreeName) {
    return null;
  }

  return `${path.slice(0, markerIndex)}${WORKTREE_PATH_MARKER}${worktreeName}`;
}
