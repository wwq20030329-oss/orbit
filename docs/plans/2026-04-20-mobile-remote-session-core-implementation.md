# Mobile Remote Session Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mobile remote-session stability and optimistic first-message state into `sync/storage` so phone conversation pages stop owning connection and loading patches.

**Architecture:** Add a storage-level remote session view hook, back it with shared connection snapshots and pending optimistic seeds, then update phone conversation components to consume that view instead of managing stability state locally.

**Tech Stack:** React Native, Zustand storage, TypeScript, Vitest

---

### Task 1: Persist connection stability across remounts

**Files:**
- Modify: `packages/orbit-app/sources/utils/sessionConnectionStability.ts`
- Modify: `packages/orbit-app/sources/utils/sessionConnectionStability.spec.ts`

- [ ] Add a native-target keyed snapshot map to `sessionConnectionStability.ts`.
- [ ] Export `rememberStableSessionConnection(...)`.
- [ ] Update `shouldHoldConnectedUi(...)` to read from the snapshot instead of a component-local timestamp.
- [ ] Add tests for:
  - grace window hold
  - expiry
  - pending native connection bypass
  - reuse across wrapper/direct session remount

### Task 2: Add storage-owned pending session seeds

**Files:**
- Modify: `packages/orbit-app/sources/sync/storage.ts`

- [ ] Add `pendingPhoneConversationSeeds` state keyed by `sessionId`.
- [ ] Add actions to set and clear a pending seed.
- [ ] Clear seeds when real session messages become loaded.

### Task 3: Add storage-owned remote session view hook

**Files:**
- Modify: `packages/orbit-app/sources/sync/storage.ts`

- [ ] Add a hook such as `useRemoteSessionView(sessionId, options?)`.
- [ ] Have it derive:
  - raw session
  - fallback messages
  - stable messages
  - stable disconnected state
  - pending optimistic seed
- [ ] Keep the hook pure on read and use hook-local effects inside the storage module to update snapshots.

### Task 4: Switch phone home/new session flow to storage seeds

**Files:**
- Modify: `packages/orbit-app/sources/components/PhoneSessionHome.tsx`
- Modify: `packages/orbit-app/sources/components/PhoneNewSessionHome.tsx`

- [ ] Remove optimistic message/CLI payloads from `PhoneSessionHome` local state.
- [ ] Store the pending seed in storage when a new session is spawned.
- [ ] Keep home navigation driven by `sessionId` only.

### Task 5: Simplify `PhoneConversationSession`

**Files:**
- Modify: `packages/orbit-app/sources/components/PhoneConversationSession.tsx`

- [ ] Replace direct `useSession` / `useSessionMessages` / local stability state with `useRemoteSessionView(...)`.
- [ ] Remove component-local `lastConnectedAt` and `stabilityNow`.
- [ ] Remove optimistic props and read pending seed from the remote session view.
- [ ] Keep UI behavior unchanged except for improved stability.

### Task 6: Verify the slice

**Files:**
- Modify: none

- [ ] Run `corepack yarn workspace orbit-app test sources/utils/sessionConnectionStability.spec.ts --run`
- [ ] Run `corepack yarn workspace orbit-app typecheck`
- [ ] Run `corepack yarn workspace orbit-app test`
