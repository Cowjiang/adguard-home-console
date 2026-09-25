# AdGuard Home Console

A cross-platform management console for AdGuard Home, built with React 19 + Vite + Tailwind 4 + Express. The web app delivers a consistent experience on phones, tablets, and desktop browsers, and the repository also hosts a Tauri 2 shell for desktop and iOS/Android builds. The UI ships in English and Chinese.

Built against the modern AdGuard Home v0.107.79 HTTP API (`POST /control/protection`, `PUT /querylog/config/update`, etc.), with partial compatibility for legacy structures.

## Features

- **Overview**: protection toggle with timed pause, query/blocked statistics, 24h trend chart, top lists, upstream latency
- **Query log**: live scrolling (2s polling), filtering by block reason, domain/client search, detail overlay, one-click block/allowlist
- **Protection**: filter-list management, custom rules, blocked services, DNS rewrites, a rule checker, Safe Search / parental control
- **Clients**: create/edit/delete persistent clients, per-client filtering policies, promote auto-detected clients to persistent entries
- **Settings**: log/statistics retention and anonymization, full DNS configuration, upstream testing, access control, encryption, DHCP, theme

## Quick start

```bash
npm install

# Development (frontend on 5173 + server on 8787)
npm run dev:all

# Production (built assets served by the Express server)
npm run build
npm start
```

Open http://localhost:8787 and enter your AdGuard Home address with your username and password.

Optionally create a `.env` file in the project root (already gitignored) to prefill a default address:

```
AGH_DEFAULT_URL=http://AGH_ADDRESS:PORT
```

`AGH_DEFAULT_URL` only prefills the login page and can be omitted; to switch between instances, enter a different address on the login page.

### Access from your LAN

When a phone or another device is on the same network as the computer, open `http://<COMPUTER_IP>:8787` on that device and use "Add to Home Screen" for a full-screen app experience.

## Architecture

```
Browser ──┬── static assets (dist) ──────────────── Express (8787)
          └── /api/agh/* ── forwarded ──▶  AdGuard Home /control/*
                 (target set via the X-AGH-Target header,
                  Authorization Basic passed through,
                  308 redirects followed automatically)
```

- **Why a proxy is needed**: AdGuard Home returns no CORS headers, so browsers cannot connect directly; the proxy also keeps credentials on your machine.
- **Credential safety**: the username and password are stored only in your browser's `localStorage`; requests are forwarded by the local server and never pass through a third party.

## Native shells (Tauri 2)

The same repository carries the Tauri 2 shell for desktop and iOS/Android packaging, including a Rust proxy and this repo's own Tauri plugins. See `docs/native-platforms.md` for platform details.

## License

Apache-2.0 with Commons Clause: the source is open, and personal and non-commercial use is free; selling this software or offering paid services based on its functionality requires the author's permission. See `LICENSE` for details.
