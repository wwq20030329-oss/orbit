# Mobile Remote Session Core Design

## Goal

Stabilize the mobile remote-control path by moving transient conversation state out of phone UI components and into a shared app-level source of truth.

## Problem

The current mobile path still mixes two layers:

- `sync/storage` provides raw sessions and raw messages
- `PhoneConversationSession` adds local stability patches for connection status, message loading, and the first optimistic user message

This causes three concrete failures:

1. Re-entering a session remounts the component and loses connection memory.
2. Message loading and connection loading are stabilized separately in the view layer.
3. New sessions use page-local optimistic state instead of the same session state pipeline used by existing sessions.

## Design

### 1. Add a storage-owned remote session view

Create a storage hook that returns a stable mobile conversation view for a session id.

The hook will:

- read the raw session and raw session messages from storage
- derive fallback messages from related local sessions
- apply message stability snapshots
- apply connection stability snapshots
- expose pending optimistic seed data for new sessions

The phone conversation page will consume only this view instead of rebuilding the same logic locally.

### 2. Move connection stability to a module-level session snapshot

The current connection grace window is keyed off component-local `lastConnectedAt`. That is lost on remount.

Replace it with a module-level snapshot keyed by native CLI target:

- direct session id for non-native sessions
- `machineId + tool + backendId` for native CLI sessions

This mirrors the existing message stability strategy and preserves recent connectivity across remounts and wrapper/direct session swaps.

### 3. Move optimistic first-message seed to storage

When a new session is spawned from the phone home screen:

- store the optimistic first message text and CLI in storage under the target session id
- immediately switch the home screen to that session id
- let the conversation page read the pending seed from storage until the real session/messages arrive

This removes page-local optimistic state and makes new-session and existing-session loading share the same path.

### 4. Clear optimistic seed when the real session state is ready

The optimistic seed is temporary. It should be cleared once either of these is true:

- the session has loaded messages
- the session has become loaded with a stable loaded-empty state

That prevents stale optimistic content from lingering.

## Scope

Included:

- `packages/orbit-app/sources/sync/storage.ts`
- `packages/orbit-app/sources/utils/sessionConnectionStability.ts`
- `packages/orbit-app/sources/utils/sessionMessageStability.ts` integration point
- `packages/orbit-app/sources/components/PhoneSessionHome.tsx`
- `packages/orbit-app/sources/components/PhoneNewSessionHome.tsx`
- `packages/orbit-app/sources/components/PhoneConversationSession.tsx`

Not included:

- daemon/runtime redesign
- history/live model redesign
- UI restyling

## Success Criteria

1. Re-entering a live mobile session no longer flashes disconnected UI because connection memory survives remount.
2. New sessions no longer rely on component-local optimistic props.
3. `PhoneConversationSession` becomes a presentation component over a storage-provided remote session view.
4. Existing tests pass and new stability tests cover the remount case.
