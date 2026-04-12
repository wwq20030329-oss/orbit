# Orbit Agent

CLI client for controlling Orbit agents remotely.

Unlike `orbit` which both runs and controls agents, `orbit-agent` only controls them — listing machines, spawning sessions on a machine, creating sessions, sending messages, reading history, monitoring state, and stopping sessions.

## Installation

From the monorepo:

```bash
yarn workspace orbit-agent build
```

Or link globally:

```bash
cd packages/orbit-agent && npm link
```

## Authentication

Orbit Agent uses account authentication via QR code, the same flow as linking a device in the Orbit mobile app.

```bash
# Authenticate by scanning QR code with the Orbit mobile app
orbit-agent auth login

# Check authentication status
orbit-agent auth status

# Clear stored credentials
orbit-agent auth logout
```

Credentials are stored at `~/.orbit/agent.key`.

## Commands

### List sessions

```bash
# List all sessions
orbit-agent list

# List only active sessions
orbit-agent list --active

# Output as JSON
orbit-agent list --json
```

### List machines

```bash
# List all machines
orbit-agent machines

# List only active machines
orbit-agent machines --active

# Output as JSON
orbit-agent machines --json
```

### Spawn on a machine

```bash
# Spawn a session on a specific machine
orbit-agent spawn --machine <machine-id> --path ~/project

# Let the daemon create the directory if needed
orbit-agent spawn --machine <machine-id> --path ~/new-project --create-dir

# Choose a specific agent
orbit-agent spawn --machine <machine-id> --path ~/project --agent codex

# Output as JSON
orbit-agent spawn --machine <machine-id> --path ~/project --json
```

### Session status

```bash
# Get live session state (supports ID prefix matching)
orbit-agent status <session-id>

# Output as JSON
orbit-agent status <session-id> --json
```

### Create a session

```bash
# Create a new session with a tag
orbit-agent create --tag my-project

# Specify a working directory
orbit-agent create --tag my-project --path /home/user/project

# Output as JSON
orbit-agent create --tag my-project --json
```

### Send a message

```bash
# Send a message to a session
orbit-agent send <session-id> "Fix the login bug"

# Send with yolo permissions
orbit-agent send <session-id> "Ship it" --yolo

# Send and wait for the agent to finish
orbit-agent send <session-id> "Run the tests" --wait

# Output as JSON
orbit-agent send <session-id> "Hello" --json
```

### Message history

```bash
# View message history
orbit-agent history <session-id>

# Limit to last N messages
orbit-agent history <session-id> --limit 10

# Output as JSON
orbit-agent history <session-id> --json
```

### Stop a session

```bash
orbit-agent stop <session-id>
```

### Wait for idle

```bash
# Wait for agent to become idle (default 300s timeout)
orbit-agent wait <session-id>

# Custom timeout
orbit-agent wait <session-id> --timeout 60
```

Exit code 0 when agent becomes idle, 1 on timeout.

## Environment Variables

- `ORBIT_SERVER_URL` - API server URL (default: `https://api.cluster-fluster.com`)
- `ORBIT_HOME_DIR` - Home directory for credential storage (default: `~/.orbit`)

## Session ID Matching

All commands that accept a `<session-id>` support prefix matching. You can provide the first few characters of a session ID and the CLI will resolve the full ID.

Machine-aware commands such as `spawn --machine <machine-id>` also support ID prefix matching.

## Encryption

All machine and session data is end-to-end encrypted. New records use AES-256-GCM with per-record keys. Existing records created by other clients are decrypted using the appropriate key scheme (AES-256-GCM or legacy NaCl secretbox).

## Requirements

- Node.js >= 20.0.0
- An Orbit mobile app account for authentication

## Publishing to npm

Maintainers can publish a new version:

```bash
yarn release               # From repo root: choose library to release
# or directly:
yarn workspace orbit-agent release
```

This flow:
- runs tests/build checks via `prepublishOnly`
- creates a release commit and `orbit-agent-vX.Y.Z` tag
- creates a GitHub release with generated notes
- publishes `orbit-agent` to npm

## License

MIT
