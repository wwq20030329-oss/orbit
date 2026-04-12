# Orbit

Remote control for AI coding agents from your phone, browser, or terminal.

Free. Open source. Code anywhere.

## Installation

```bash
npm install -g orbit
```

## Usage

### Claude Code (default)

```bash
orbit
# or
orbit claude
```

This will:
1. Start a Claude Code session
2. Display a QR code to connect from your mobile device or browser
3. Allow real-time session control — all communication is end-to-end encrypted
4. Start new sessions directly from your phone or web while your computer is online

### More agents

```
orbit codex
orbit gemini
orbit openclaw

# or any ACP-compatible CLI
orbit acp opencode
orbit acp -- custom-agent --flag
```

## Daemon

The daemon is a background service that stays running on your machine. It lets you spawn and manage coding sessions remotely — from your phone or the web app — without needing an open terminal.

```bash
orbit daemon start
orbit daemon stop
orbit daemon status
orbit daemon list
```

The daemon starts automatically when you run `orbit`, so you usually don't need to manage it manually.

## Authentication

```bash
orbit auth login
orbit auth logout
```

Orbit uses cryptographic key pairs for authentication — your private key stays on your machine. All session data is end-to-end encrypted before leaving your device.

To connect third-party agent APIs:

```bash
orbit connect gemini
orbit connect claude
orbit connect codex
orbit connect status
```

## Commands

| Command | Description |
|---------|-------------|
| `orbit` | Start Claude Code session (default) |
| `orbit codex` | Start Codex mode |
| `orbit gemini` | Start Gemini CLI session |
| `orbit openclaw` | Start OpenClaw session |
| `orbit acp` | Start any ACP-compatible agent |
| `orbit resume <id>` | Resume a previous session |
| `orbit notify` | Send push notification to your devices |
| `orbit doctor` | Diagnostics & troubleshooting |

---

## Advanced

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ORBIT_SERVER_URL` | Custom server URL (default: `https://api.cluster-fluster.com`) |
| `ORBIT_WEBAPP_URL` | Custom web app URL (default: `https://app.orbit.engineering`) |
| `ORBIT_HOME_DIR` | Custom home directory for Orbit data (default: `~/.orbit`) |
| `ORBIT_DISABLE_CAFFEINATE` | Disable macOS sleep prevention |
| `ORBIT_EXPERIMENTAL` | Enable experimental features |

### Sandbox (experimental)

Orbit can run agents inside an OS-level sandbox to restrict file system and network access.

```bash
orbit sandbox configure
orbit sandbox status
orbit sandbox disable
```

### Building from source

```bash
git clone https://github.com/wwq20030329-oss/orbit.git
cd orbit
yarn install
yarn workspace orbit --help
```

## Requirements

- Node.js >= 20.0.0
- For Claude: `claude` CLI installed & logged in
- For Codex: `codex` CLI installed & logged in
- For Gemini: `npm install -g @google/gemini-cli` + `orbit connect gemini`

## License

MIT
