<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="/.github/logotype-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="/.github/logotype-light.png">
    <img src="/.github/logotype-dark.png" width="400" alt="Orbit">
  </picture>
</div>

<h1 align="center">
  Orbit: Remote Control for Claude Code & Codex
</h1>

<h4 align="center">
Operate Claude Code or Codex from anywhere with end-to-end encryption.
</h4>

<div align="center">
  
[🌐 **Web App**](https://app.orbit.engineering) • [📦 **Repository**](https://github.com/wwq20030329-oss/orbit) • [📚 **Documentation**](https://github.com/wwq20030329-oss/orbit/tree/main/docs)

</div>

<img width="5178" height="2364" alt="github" src="/.github/header.png" />


<h3 align="center">
Step 1: Download App
</h3>

<div align="center">
Orbit mobile builds are being prepared. For now, use the web app and local CLI in this repository.
</div>

<h3 align="center">
Step 2: Install Orbit CLI on your computer
</h3>

```bash
npm install -g orbit
```

<h3 align="center">
Step 3: Start using `orbit` instead of `claude` or `codex`
</h3>

```bash
orbit
# or
orbit codex
```

## How does it work?

On your computer, run `orbit` instead of `claude`, or `orbit codex` instead of `codex`, to start your agent through Orbit. Orbit focuses on encrypted remote control, session visibility, device handoff, and cloud-backed synchronization.

## Why Orbit?

- 📱 **Mobile access to Claude Code and Codex** - Check what your AI is building while away from your desk
- 🔔 **Push notifications** - Get alerted when Claude Code and Codex needs permission or encounters errors  
- ⚡ **Switch devices instantly** - Take control from phone or desktop with one keypress
- 🔐 **End-to-end encrypted** - Your code never leaves your devices unencrypted
- 🛠️ **Open source** - Audit the code yourself. No telemetry, no tracking

## 📦 Project Components

- **Orbit App** - Web UI + mobile client (Expo)
- **Orbit CLI** - Command-line interface for Claude Code and Codex
- **Orbit Agent** - Remote agent control CLI (create, send, monitor sessions)
- **Orbit Server** - Backend server for encrypted sync

## 🏠 Who We Are

Orbit is being rebuilt around one idea: you should be able to supervise, approve, and hand off coding agents from anywhere without feeling like you are using a second-class companion app.

## 📚 Documentation & Contributing

- **[Documentation](https://github.com/wwq20030329-oss/orbit/tree/main/docs)** - Learn how Orbit is structured today
- **[Contributing Guide](docs/CONTRIBUTING.md)** - How to contribute, PR guidelines, and development setup
- **[Project Repository](https://github.com/wwq20030329-oss/orbit)** - Source, issues, and ongoing roadmap

## License

MIT License - see [LICENSE](LICENSE) for details.
