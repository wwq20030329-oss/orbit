# Worktree Workflow

Orbit now includes a small helper for keeping large refactors isolated in separate git worktrees.

## Why

The main local checkout is currently used as an integration/smoke-test workspace. New feature work and cleanup refactors should happen in dedicated worktrees so unfinished changes do not pollute the stable local branch.

## Commands

From the repo root:

```bash
yarn worktree:list
yarn worktree:new session-refactor
yarn worktree:new cli-cleanup codex/cli-cleanup
yarn worktree:remove session-refactor
yarn worktree:prune
```

## Default layout

New worktrees are created next to the repo, under:

```text
../claudeapp-worktrees/<name>
```

For example:

```text
/Users/wwq/Desktop/claudeapp-worktrees/session-refactor
```

## Branch naming

If no branch is provided, the helper creates:

```text
codex/<name>
```

That keeps cleanup and feature work isolated from the integration branch.

## Recommended usage

Use the main checkout for:

- smoke tests
- local app/dev-server runs
- quick verification

Use worktrees for:

- app session/navigation refactors
- CLI runtime cleanup
- server/deploy fixes
- risky experiments

This keeps each cleanup line reviewable and easier to push independently.
