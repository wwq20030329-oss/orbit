# Orbit

Remote control for Claude Code, Codex, and Gemini from mobile, web, and CLI.

Orbit lets you start an AI coding session on your computer, follow it from your phone, approve tool permissions, stop a running turn, and resume work without losing the thread. The project is built around encrypted sync, native CLI compatibility, and a phone UI that feels like a real coding companion rather than a status monitor.

## What Orbit Does

- **Mobile remote control**: supervise active coding sessions from iOS, Android, or web.
- **Native CLI support**: wrap Claude Code, Codex, and Gemini sessions from one local CLI.
- **Live session visibility**: stream messages, tool calls, permission requests, and run state.
- **Fast handoff**: move between computer and phone while preserving session context.
- **Encrypted sync**: keep session data encrypted before it leaves your device.
- **TrollStore-friendly builds**: generate a `.tipa` for sideloading local iOS builds.

## Install

```bash
npm install -g orbit
```

Start a session from your computer:

```bash
orbit claude
orbit codex
orbit gemini
```

Or use the remote agent control CLI:

```bash
orbit-agent auth login
orbit-agent sessions
orbit-agent send <session-id> "continue"
```

## Mobile App

The Expo app lives in `packages/orbit-app`.

For local iOS TrollStore builds:

```bash
bash packages/orbit-app/scripts/build-tipa.sh
```

The generated package is copied to:

```text
/Users/wwq/Desktop/Orbit.tipa
```

## Repository Layout

- `packages/orbit-app`: Expo / React Native mobile and web client.
- `packages/orbit-cli`: local CLI wrapper for native coding agents.
- `packages/orbit-agent`: remote control CLI for existing Orbit sessions.
- `packages/orbit-server`: encrypted sync, presence, auth, and live session backend.
- `packages/orbit-wire`: shared protocol and message types.
- `docs`: architecture notes, protocol docs, and development plans.

## Development

Install dependencies:

```bash
corepack yarn install
```

Run focused checks:

```bash
corepack yarn -s workspace orbit-app typecheck
corepack yarn -s workspace orbit-app test
```

Build the iOS `.tipa`:

```bash
bash packages/orbit-app/scripts/build-tipa.sh
unzip -t /Users/wwq/Desktop/Orbit.tipa
```

## Current Product Focus

Orbit is focused on making phone-based AI coding control feel calm and continuous:

- inline conversation run state instead of scattered connection badges
- send button becomes stop while a turn is running
- floating settings and project session surfaces
- native live mirror separated from session control ability
- clearer Claude / Codex / Gemini session metadata

## License

MIT. See [LICENSE](LICENSE).
