# contract/

Behavioral contracts shared by more than one tier. `agh-proxy.contract.json` is
the AGH proxy contract owned by the frontend (`src/lib/api.ts`); the two
adapters — `server/proxy.mjs` (Express, web/PWA) and `src-tauri/src/proxy.rs`
(`agh_fetch`, Tauri shell) — are tested against this same scenario file by the
runners in `server/proxy.test.mjs` (`npm run test:server`) and the tests in
`proxy.rs` (`cargo test`). The file format rules are documented in its
`comment` header; both runners implement them identically.
