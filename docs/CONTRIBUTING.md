# Contributing to Orbit

Orbit is built by engineers who use AI coding tools all day — and we built Orbit so we could supervise them from anywhere. Contributions that make Orbit better for that workflow are welcome.

If you don't get a response on your PR or issue, tag **@bra1ndump**.

## Contribution Priorities

We review contributions in this order:

1. **Bug fixes** — crashes, broken flows, data loss
2. **UI touchups** — polish, layout fixes, visual consistency
3. **New features** — new capabilities that serve the core use case
4. **Refactors** — code quality improvements, test coverage
5. **Core refactors** — sync engine, RPC layer, server changes (discuss first)

If your contribution is lower on this list, it may take longer to get reviewed. That's not a reflection of its value — it's just how we triage.

## Issues

We currently can't reply to every issue individually. We review them in bulk using AI-assisted triage. They're useful — keep filing them — but PRs with clear fixes will always get priority.

Every issue should start with a **one-paragraph summary** of the problem. Don't bury the lede in reproduction steps or logs. Lead with what's broken and what you expected.

## Pull Requests

### The Rules

1. **Start with a one-paragraph summary.** What was broken or missing? What does this PR do about it? A human skimming 20 PRs needs to understand yours in 10 seconds.

2. **Show proof it works.** Include a video, screenshots, or actual log output demonstrating the fix in a real running app. The "before" state can be described with words. The "after" must be shown visually. Unit tests passing is not enough — show it working end-to-end.

3. **Address Codex review comments before requesting human review.** We use automated Codex reviews on all PRs. Resolve those first — they catch the obvious stuff so human reviewers can focus on the important stuff.

4. **Keep PRs focused.** One fix per PR. One feature per PR. If you touched something unrelated, split it out.

5. **Core changes need a discussion first.** If your PR touches the sync engine, RPC protocol, encryption, or server — open an issue or Discord thread before writing code. These areas affect every user and need design alignment.

### What Makes a Good PR

- **Show proof it works.** Screenshots, screen recordings, or actual log output demonstrating the fix in a real running app. Unit tests passing is not enough — show it working end-to-end.
- Links to the issue it fixes (if one exists)
- Short, clear title (`fix: voice session stuck in connecting state` not `Update voice.ts`)
- No unrelated changes, no drive-by refactors

## Development Setup

### Prerequisites

- Node.js >= 20
- Yarn (`npm install -g yarn`)
- Git

### Getting Started

```bash
git clone https://github.com/wwq20030329-oss/orbit.git
cd orbit
yarn install
```

### Orbit App (Mobile + Web)

```bash
yarn workspace orbit-app start          # Expo dev server
yarn workspace orbit-app ios:dev        # iOS simulator
yarn workspace orbit-app android:dev    # Android emulator
yarn web                                # Browser (shortcut)
yarn workspace orbit-app typecheck      # Run after all changes
```

The app has three build variants — all can be installed simultaneously on the same device:

| Variant | Bundle ID | App Name | Use Case |
|---------|-----------|----------|----------|
| Development | `com.orbit.app.dev` | Orbit (dev) | Local development with hot reload |
| Preview | `com.orbit.app.preview` | Orbit (preview) | Beta testing & OTA updates |
| Production | `com.orbit.app` | Orbit | App Store release |

Swap `ios:dev` for `ios:preview` or `ios:production` (same for `android:`).

#### Desktop (Tauri)

```bash
yarn workspace orbit-app tauri:dev      # Run with hot reload
yarn workspace orbit-app tauri:build:dev
```

### Orbit CLI

```bash
yarn workspace orbit build
yarn workspace orbit test
yarn workspace orbit dev                # Run without building (uses tsx)
```

#### Local `orbit-dev` Command

To test your local build without overwriting the global `orbit`:

```bash
cd packages/orbit-cli
yarn link:dev       # Creates global orbit-dev symlink
yarn unlink:dev     # Removes it
```

Now `orbit` runs the stable npm version, `orbit-dev` runs your local build.

#### Stable vs Dev Data Isolation

The CLI keeps stable and dev data completely separate:

| | Stable | Development |
|-|--------|-------------|
| Data | `~/.orbit/` | `~/.orbit-dev/` |
| Start daemon | `npm run stable:daemon:start` | `npm run dev:daemon:start` |

First time? Run `npm run setup:dev` to create the dev data directory.

### Orbit Server

```bash
yarn workspace orbit-server standalone:dev   # Local server (no Docker needed)
```

Runs on `localhost:3005` with embedded PGlite. To point the app at your local server:

```bash
EXPO_PUBLIC_ORBIT_SERVER_URL=http://localhost:3005 yarn workspace orbit-app start
```

## Project Structure

This is a monorepo with four packages:

- **orbit-app** — React Native + Expo mobile/web client branded as Orbit
- **orbit-cli** — Node.js CLI that wraps Claude Code and Codex under the `orbit` command
- **orbit-agent** — Remote agent control
- **orbit-server** — Backend for encrypted sync

For architecture details, check the [docs/](.) folder or ask Orbit itself — it knows how the project is set up.

## Community

- [Discord](https://discord.gg/fX9WBAhyfD) — best place for questions and discussion
- [Documentation](https://github.com/wwq20030329-oss/orbit/tree/main/docs)
