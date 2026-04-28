# OpenCode Sources

Reviewed on 2026-03-21.

- repo: `https://github.com/sst/opencode`
- checkout: `../orbit-adjacent/research/opencode`
- commit: `2e0d5d230893dbddcefb35a02f53ff2e7a58e5d0`

## Primary files inspected

- `../orbit-adjacent/research/opencode/packages/opencode/src/session/message-v2.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/session/index.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/session/prompt.ts`
- `../orbit-adjacent/research/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/tool/task.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/tool/todo.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/permission/index.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/permission/evaluate.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/server/server.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/server/routes/experimental.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/auth/index.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/control-plane/workspace-server/routes.ts`
- `../orbit-adjacent/research/opencode/packages/opencode/src/control-plane/sse.ts`
- `../orbit-adjacent/research/opencode/packages/app/src/context/global-sync.tsx`
- `../orbit-adjacent/research/opencode/packages/app/src/context/global-sync/event-reducer.ts`
- `../orbit-adjacent/research/opencode/packages/app/src/components/session-context-usage.tsx`
- `../orbit-adjacent/research/opencode/packages/app/src/components/session/session-context-tab.tsx`

## Notes

- The context/debug surface is not a side detail; it is one of the strongest product ideas in the repo.
- The server split deserves deeper follow-up work after this first pass.
