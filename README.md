<div align="center">

<img src="docs/images/logo.png" width="96" alt="AGH Console logo" />

# AdGuard Home Console

**A modern, cross-platform web console for [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome).**

Full management UI in your browser, as a PWA on your phone, or in a native shell on desktop and mobile — English & 简体中文, light & dark.

**AGH Console** is the app's product name — it is what the browser tab, the desktop window and your phone's home screen show. The npm package and the container image are published as `agh-console`; "AdGuard Home Console" is this repository's project name.

English | [简体中文简介](docs/assets/README.zh-CN.md)

[![CI](https://github.com/Cowjiang/adguard-home-console/actions/workflows/release.yml/badge.svg)](https://github.com/Cowjiang/adguard-home-console/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/Cowjiang/adguard-home-console?include_prereleases)](https://github.com/Cowjiang/adguard-home-console/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0%20with%20Commons%20Clause-blue)](#license)
[![Node](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)

<img src="docs/images/dashboard-dark.png" alt="AdGuard Home Console dashboard (dark)" width="900" />

</div>

## Why

AdGuard Home has no CORS headers, so a browser cannot talk to its API directly — every third-party "cloud console" for it needs a middleman server that sees your credentials. AdGuard Home Console flips that around with a self-hosted server that keeps you in complete control:

- **Dual connection modes**:
  - **Direct Mode** — Pure stateless client-side connection. The Express server only serves static files and reverse-proxies `/api/agh/*` to your AdGuard Home. Credentials and snapshots stay strictly in your browser (`localStorage` / `IndexedDB`). Zero server-side disk writes.
  - **Managed Mode** — Zero-Knowledge blind storage (`/api/managed/*`). Encrypts configuration snapshots client-side using AES-256-GCM before uploading, enabling multi-device synchronization and instance registry across browsers, desktop shells, and iOS. The server stores only ciphertext blobs and salt metadata — never plaintext passwords or configurations.
- **Self-hosted by design** — No accounts, no telemetry, no third party in the middle.
- **Runs anywhere** — One Node process serves the UI, proxy, and optional blind storage; expose it to your LAN, your VPN (Tailscale, EasyTier), or keep it on localhost.
- **Built for the current API** — Targets the AdGuard Home v0.107.79 HTTP API (`POST /control/protection`, `PUT /querylog/config/update`, …), with partial compatibility for legacy structures.

## Features

- **Direct & Managed modes** — Stateless direct connection with zero server-side storage, or managed mode with client-side Zero-Knowledge E2EE blind storage, multi-device snapshot sync, and offline outbox queue
- **Overview** — protection toggle with timed pause, query/blocked statistics, 24h traffic trend, top domains & clients, upstream latency and uptime
- **Query log** — live scrolling (2s polling), filter by result or DNS type, search by domain/client, detail overlay with one-click block/allowlist
- **Filters** — blocklist & allowlist management, custom filtering rules with a rule checker, blocked services, DNS rewrites, Safe Browsing / parental control / SafeSearch
- **Clients** — persistent clients with per-client filtering policies, promote auto-detected clients in one click
- **Settings** — query log & statistics retention and anonymization, full DNS configuration with upstream testing, access control, TLS encryption, DHCP server
- **UX** — light/dark/auto theme, English & 简体中文, installable as a PWA with pull-to-refresh on mobile

## Getting started

### Docker

Multi-arch (`amd64` / `arm64`). A stable `vX.Y.Z` tag publishes `latest`, `X.Y.Z` and `X.Y`; the nightly built from `dev` publishes `nightly` and `sha-<commit>`.

**Direct Mode (stateless, nothing to mount):**

```bash
docker run -d --name agh-console -p 8787:8787 ghcr.io/cowjiang/agh-console:latest
```

**Managed Mode (persists encrypted snapshots and instance metadata across container updates):**

```bash
docker run -d --name agh-console -p 8787:8787 \
  -v agh-data:/app/data \
  ghcr.io/cowjiang/agh-console:latest
```

- In **Direct Mode**, the container is completely stateless — no volume is needed.
- In **Managed Mode**, mount a persistent volume at `/app/data` to retain Zero-Knowledge encrypted snapshots and registered instance metadata across container restarts and updates.
- To prefill the login page, pass `-e AGH_DEFAULT_URL=http://192.168.1.2:3000`.

The GHCR package is public. Note that a package does **not** inherit the repository's visibility — that is its own switch in the package settings — so a private package would instead require `docker login ghcr.io` with a `read:packages` token.

Or with Docker Compose:

```yaml
services:
  agh-console:
    image: ghcr.io/cowjiang/agh-console:latest
    container_name: agh-console
    restart: unless-stopped
    ports:
      - "8787:8787"
    volumes:
      # Optional for direct mode; recommended for managed mode (E2EE blind storage)
      - agh-data:/app/data
    # environment:
    #   AGH_DEFAULT_URL: http://192.168.1.2:3000
    #   AGH_DATA_DIR: /app/data

volumes:
  agh-data:
```

### npx

Requires Node.js ≥ 24. The package ships the built UI together with the server, so it starts the same process as the other channels:

```bash
npx agh-console
PORT=9000 npx agh-console     # configuration goes in the environment
```

Stable versions sit on the default `latest` dist-tag; the nightly from `dev` is on `nightly` (`npx agh-console@nightly`).

### Release tarball

Download `agh-console.tar.gz` from the [latest release](https://github.com/Cowjiang/adguard-home-console/releases), then:

```bash
mkdir agh-console && cd agh-console
tar xzf /path/to/agh-console.tar.gz
pnpm install --prod
pnpm start
```

### iOS

Every release also carries `agh-console.ipa`, built from the same commit as the other artifacts. It is **unsigned**, because it is built without an Apple certificate: iOS only installs apps signed by a certificate you own, so re-sign it with your own Apple ID before installing. Sideloadly and AltStore do that on Windows or macOS, Xcode on macOS. A free Apple ID is enough — its signing profile expires after seven days, after which the app has to be re-signed to run again.

### Windows

Every release also carries `agh-console-setup.exe` (NSIS, for the usual double-click install) and `agh-console.msi` (WiX, for group policy or scripted deployment), built from the same commit as the other artifacts. They install per user, so no administrator rights are needed, and the installer pulls the WebView2 runtime from Microsoft when the machine does not have it yet. Both are **unsigned**, because the build has no Windows code-signing certificate, so SmartScreen warns on first run — "More info" → "Run anyway".

### Build from source

Requires Node.js ≥ 24 and pnpm (`corepack enable` is enough; both versions are pinned in `package.json`).

```bash
git clone https://github.com/Cowjiang/adguard-home-console.git
cd adguard-home-console
pnpm install

pnpm dev:all                 # development: frontend on 5173, proxied to the server on 8787
pnpm build && pnpm start     # production: built assets served by Express on 8787
```

Open **http://localhost:5173** (development) or **http://localhost:8787** (production) and enter your AdGuard Home address, username, and password.

## Configuration

All environment variables are optional. The server also reads a `.env` file in the project root when it runs from a source checkout or an unpacked tarball; under npx or Docker, pass the variables in the environment.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | HTTP listen port |
| `HOSTS` | all interfaces | Comma-separated bind addresses or interface names (e.g. `127.0.0.1,tailscale0`); interface names re-resolve on address change |
| `AGH_DEFAULT_URL` | — | Prefills the AGH address on the login page; switching instances is just entering another address |
| `AGH_DATA_DIR` | `<ROOT>/data` (Docker: `/app/data`) | Directory for managed mode zero-knowledge blind storage (encrypted snapshots & instance metadata) |
| `AGH_ENABLE_SELF_UPGRADE` | — | `1` enables the channel and self-upgrade endpoints; keep the listener on trusted networks |
| `AGH_UPDATE_CHANNEL` | `stable` | Fallback update channel when the server has no persisted choice |
| `AGH_STATE_DIR` | `/var/lib/agh-console` | State directory for `deployed-tag`, `update-channel`, upgrade status and logs; falls back to `AGH_DATA_DIR`, then the user state dir |
| `AGH_DEPLOYMENT` | `auto` | Updater selection: `tarball`, `npm`, or `docker` |
| `AGH_PACKAGE_MANAGER` | `npm` | Set to `pnpm` for pnpm global installs |
| `AGH_SERVICE_NAME` | `agh-console` | systemd unit restarted after a self-upgrade |
| `AGH_UPGRADE_SCRIPT` | — | Custom shell updater with highest priority; receives `AGH_UPGRADE_CHANNEL` |

### Access from your LAN

On a phone or another device in the same network, open `http://<COMPUTER_IP>:8787` and use **Add to Home Screen** for a full-screen app experience.

## How it works

```
                          ┌── static assets (dist) ──────── Express (8787)
                          │                                  │
Browser ──┬─ Direct mode ─┼── /api/agh/* ── forwarded ───────┼─▶ AdGuard Home /control/*
          │               │   (target in X-AGH-Target,      │
          │               │    Authorization Basic passed,  │
          │               │    same-host 308 redirects)     │
          │                                                 │
          └─ Managed mode ─── /api/managed/* ───────────────┘
                              (Zero-Knowledge E2EE blind storage:
                               encrypted snapshots & instance metadata;
                               persisted to AGH_DATA_DIR /app/data)
```

- **Direct Mode**: Credentials and snapshots are stored only in your browser (`localStorage` / `IndexedDB`). Requests are forwarded by your local server proxy and never pass through a third party.
- **Managed Mode**: The server acts as a blind storage vault for multi-device synchronization. Snapshots are encrypted client-side using AES-256-GCM before upload, and keys are derived from your AGH credentials via PBKDF2 (SHA-256, 600,000 iterations). The server never sees plaintext passwords or configuration details.

## Native shells

The same repository carries a [Tauri 2](https://tauri.app) shell for desktop and iOS/Android packaging, including a Rust proxy and this repo's own Tauri plugins (native glass header components, pull-to-refresh, and more). See [docs/native-platforms.md](docs/native-platforms.md) for platform details.

<div align="center">
  <img src="docs/images/ios-query-log.png" width="270" alt="Live query log in the iOS app" />
  <img src="docs/images/ios-filters.png" width="270" alt="Blocklist filters in the iOS app" />
  <img src="docs/images/ios-settings.png" width="270" alt="Settings in the iOS app" />
  <br />
  <sub>iOS app — live query log, blocklist filters, settings</sub>
</div>

## Development

```bash
pnpm check           # typecheck (TypeScript strict)
pnpm test            # unit tests (vitest)
pnpm build           # production build
```

Rust-side tests: start the contract mock first, then run cargo test — cases that depend on the mock exit silently when it is not running:

```bash
node scripts/mock-agh.mjs &
cd src-tauri && cargo test
```

Bug reports and pull requests are welcome — open an [issue](https://github.com/Cowjiang/adguard-home-console/issues) with your AdGuard Home version and the console logs.

## Disclaimer

This project is an **unofficial** client for AdGuard Home. It is not affiliated with, endorsed by, or sponsored by AdGuard. "AdGuard" and "AdGuard Home" are trademarks of their respective owners; this project only uses their names to describe what it manages.

## License

[Apache-2.0](LICENSE) with the [Commons Clause](LICENSE).

The source is open: personal and non-commercial use — including self-hosting for your family or team — is free. What it does not grant is selling the software itself, or offering paid hosting/support services whose value comes from its functionality, without the author's permission. See [LICENSE](LICENSE) for the full text.

## Acknowledgements

- [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) — the network-wide ads & trackers blocking DNS server this console manages
- Built with [React](https://react.dev), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com), [Express](https://expressjs.com), [SWR](https://swr.vercel.app), and [Tauri](https://tauri.app)
