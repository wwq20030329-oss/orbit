# Live Terminal Mirror Migration

Status: **DRAFT**

## Goal

Turn Orbit from a message-sync companion into a remote attachment layer for the
same CLI terminal session that is running on the desktop.

The user should see the live terminal itself, not a delayed message copy of the
session after the fact.

## Problem Statement

Today Orbit's real-time path is centered around encrypted session messages and
session metadata updates:

- the desktop CLI translates provider output into session protocol envelopes
- the server relays encrypted session updates and ephemeral activity
- the app renders a message list and re-fetches after reconnect / visibility

This model is good for durable chat history, but it is the wrong truth source
for a "same terminal, different device" experience:

- output is seen after translation, not as the terminal emits it
- reconnects require message catch-up instead of terminal frame catch-up
- long-running in-flight operations are represented indirectly
- mobile cannot truly "attach" to the active runtime

## Product Decision

Orbit should keep structured sync, but structured sync is no longer the primary
real-time surface.

New primary surface:

- live terminal mirror
- runtime backlog replay
- attach / detach semantics
- interactive control (incremental, phased)

Structured sync becomes an overlay:

- approvals
- usage
- artifacts / diffs
- provider-specific state

## Non-Goals (Phase 1)

- Attaching to arbitrary external GUI terminal tabs
- Full TUI parity for every alternate-screen terminal app
- Replacing the durable encrypted session transcript
- Solving every provider at once

## Principles

1. The runtime session is the truth source for live interaction.
2. The transcript remains the durable archive and search surface.
3. The first implementation only supports Orbit-launched runtimes.
4. We prefer tmux-backed attachable sessions over custom PTY plumbing when
   possible.
5. Existing auth, encryption, socket auth scopes, and metadata plumbing should
   be reused instead of introducing a parallel auth system.

## Current Insertion Points

These are the cleanest places to layer live mirror into the existing system:

- CLI runtime spawn already supports tmux-backed sessions:
  `packages/orbit-cli/src/daemon/run.ts`
- The daemon already has native live mirror metadata helpers:
  `packages/orbit-cli/src/daemon/nativeLiveMirror.ts`
- Server socket auth already distinguishes:
  - `user-scoped`
  - `session-scoped`
  - `machine-scoped`
  in `packages/orbit-server/sources/app/api/socket.ts`
- Socket routing already supports targeted fan-out through `eventRouter`:
  `packages/orbit-server/sources/app/events/eventRouter.ts`
- The app already has a single `/v1/updates` socket entrypoint:
  `packages/orbit-app/sources/sync/apiSocket.ts`

Conclusion:

- **Do not** create a second websocket service for v1.
- Reuse `/v1/updates` and add new live mirror event families.

## Target Runtime Model

We introduce a new conceptual split:

### 1. RuntimeSession

Represents a currently attachable execution surface.

Fields:

- `runtimeId`
- `sessionId`
- `machineId`
- `tool`
- `backendId`
- `backend` (`tmux` | `pty`)
- `cwd`
- `title`
- `controlState`
- `seq`
- `status`

### 2. ArchiveSession

Represents the durable encrypted Orbit transcript already stored in the current
system.

This survives disconnects and is still used for history, indexing, search, and
notifications.

### Relationship

- one archive session may have zero or one active runtime attachment
- one runtime may emit structured transcript updates, but the runtime is the
  source of live view

## Transport Model

### Main Channel: Live Terminal Frames

The runtime emits ordered frames:

- `snapshot`
- `output`
- `status`

These are not persisted as ordinary session messages.

They are:

- buffered by the daemon
- optionally relayed by the server
- replayed on attach or reconnect by `seq`

### Side Channel: Structured Overlay

Existing session protocol / updates remain for:

- approval requests and results
- tool status
- file changes and artifacts
- usage and cost
- machine/session metadata

## Backend Choice

### Preferred: tmux control mode

Why:

- native attach / detach semantics
- scrollback is already implemented
- better multi-client model
- lower complexity than building a complete PTY mirror from scratch

### Fallback: PTY

Reserved for providers or platforms where tmux is unavailable.

## Protocol Surface

Shared wire types should live in `@orbit/wire`.

Minimum event surface for MVP:

- `live-attach-request`
- `live-attach-accepted`
- `live-frame`
- `live-detach`
- `live-input`
- `live-resize`
- `live-control`

Frame kinds:

- `snapshot`
- `output`
- `status`

## Phase Plan

### Phase 1 — Protocol + daemon foundation

- add shared live mirror protocol schemas to `@orbit/wire`
- add daemon-side `LiveRuntimeManager`
- register tmux-backed runtime records for Orbit-launched Codex sessions
- emit live frames locally from daemon runtime manager

### Phase 2 — Server relay

- relay live attach / frame events through `/v1/updates`
- add backlog catch-up by `seq`
- maintain runtime presence by machine + session

### Phase 3 — App MVP

- add terminal attach screen for Codex sessions
- render live output with a terminal surface
- support:
  - read-only attach
  - text input
  - Enter
  - Ctrl+C
  - resize

### Phase 4 — Structured overlay integration

- attach approval overlays to the terminal screen
- show usage / tool status / diffs as overlays
- keep the old message view as transcript mode

### Phase 5 — Provider expansion

- Claude
- Gemini
- optional `orbit <tool>` shim mode

## Expected Risks

### 1. Mobile input semantics

Terminal mirroring is easy in read-only mode and much harder in interactive
mode. Mobile IME behavior, selection, paste, and modifier keys must be added in
layers.

### 2. Multi-device control conflicts

We need an explicit control model:

- viewer
- controller
- takeover

Otherwise multiple devices will send conflicting input.

### 3. TUI / alternate screen compatibility

The MVP should target normal CLI output first. Full-screen TUIs are a later
quality problem, not a phase-1 blocker.

### 4. Backlog retention

We need a bounded ring buffer and clear semantics for reconnect catch-up. The
server should relay recent frames, but the daemon remains the long-lived source
of truth.

## First Vertical Slice

The first shippable slice should be intentionally narrow:

- Codex only
- Orbit-launched sessions only
- tmux only
- live attach only
- terminal output only
- reconnect catch-up by `seq`
- structured overlay unchanged

That slice is enough to validate the core product question:

> Does Orbit feel like the same CLI session when viewed from the phone?

## Exit Criteria For Phase 1

- shared live mirror protocol exists in `@orbit/wire`
- daemon can register a runtime session and emit ordered frames
- runtime/session model is documented and stable enough for server relay work
