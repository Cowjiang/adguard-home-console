# AGENTS.md

AdGuard Home v0.107.79 cross-platform management console: a Web/PWA app and a Tauri 2 shell (desktop and iOS/Android mobile) live in one repository.

## Read by task, layer by layer

Take the global constraints from this file; open only the next layer relevant to the current task. Do not pre-read every plan, log, or historical snapshot.

| Current task | First-layer entry | Continue reading |
| --- | --- | --- |
| Understand or modify existing architecture, AGH contracts, interactions, platform implementations | `docs/README.md` | Pick the matching fact page, then verify against the relevant code |
| Plan or implement non-trivial behavior, architecture, contract, or process changes | `.agents/README.md` | Read track rules, classification, and current proposals from the proposal entry |
| Find a reusable agent workflow or write a skill | `.agents/README.md` | Read only the matching skill or the skill-authoring conventions |
| Trace incidents, past designs, and acceptance evidence | `.agents/README.md` | Read `logs/` and `reviews/` as needed; they record the state at the time |

`docs/` holds the current facts about this codebase and is updated alongside the implementation; `.agents/` owns proposals, skills, and process material. Historical plans do not double as the current backlog. Running behavior is defined by the code; when a fact page drifts out of date, fix it in the same change.

## Directories

| Path | Contents |
| --- | --- |
| `src/` | React frontend: `pages/`, `components/`, `lib/`, `types/` |
| `server/` | Express proxy and static hosting: `index.mjs` assembles, `proxy.mjs` is the web adapter of the frontend proxy contract, `proxy.test.mjs` runs it against the shared fixture |
| `contract/` | Behavioral contracts shared by more than one tier; `agh-proxy.contract.json` pins both AGH proxy adapters (runners: `npm run test:server` and `cargo test`) |
| `src-tauri/` | Tauri 2 shell, Rust proxy, and platform resources; `plugins/` holds this repo's Tauri plugin sources, while `gen/` and `target/` are generated output |
| `scripts/` | `mock-agh.mjs` contract mock, `verify-proposals.mjs` proposal checks, iOS signing/deploy scripts, `release-notes.sh`, `server-pull.sh` |
| `docs/` | Durable facts about the current codebase; enter by topic from `docs/README.md` |
| `.agents/` | Proposals, skills, and process records; enter by purpose from `.agents/README.md` |
| `.github/workflows/` | `release.yml`: builds artifacts and publishes a Release on pushes to `main` |

`dist/`, `node_modules/`, `src-tauri/gen/`, and `src-tauri/target/` are build or generated output; `_probe/` is local-only material. None of them are committed.

## Always follow

- Register a proposal per `.agents/README.md` before implementing non-trivial changes; small changes go through the Direct track. Proposal templates and classification follow the pipeline docs.
- Never commit credentials, signing values, machine-specific configuration, or forensic screenshots. `_probe/` is local-only material and must not be assumed to exist after a fresh clone.

## Code conventions

- The repo has no linter/formatter; style relies on convention plus `pnpm check` (`tsconfig.json` has `strict` on): TS/TSX uses 2-space indent, single quotes, and no trailing semicolons; Rust keeps 4 spaces.
- Code comments are in English and kept concise: state what the code does, the constraints it works under, and the motivation behind it; no lengthy explanations unless they are genuinely needed.
- Place new code in the existing layers: pages go in `src/pages/`, shared components and base controls in `src/components/`, requests, state, and utilities in `src/lib/`; Rust keeps one concern per file.
- Package manager is pnpm (pinned in `package.json#packageManager`); do not add a `package-lock.json`. pnpm 12's supply-chain policy rejects freshly published versions — see `docs/engineering.md`.
- All AGH requests go through `api()` in `src/lib/api.ts`; SWR uses only `swrFetcher` with keys shaped like `['<short-name>', cfg, path]`. Never place React Hooks after a conditional return.
- AGH time fields are milliseconds throughout; `stats.top_*` are single-key object arrays — normalize before consuming. Endpoints, enums, and units follow `docs/agh-api.md`; other implementation constraints live in `docs/engineering.md`.
- Commit messages use English conventional commits (`feat(scope):`, `fix(scope):`, `docs:`, `refactor(scope):`, `ci:`). Conversations with the user are in Chinese; `docs/` and `.agents/` pages are written in Chinese, while this file and `README.md` are English — match the language of the file you are editing.

## Checks

Run the checks that match the scope of your change:

- Web frontend: `pnpm check` (`tsconfig.json` has `strict` on), `pnpm test`, and `pnpm build`.
- Server/proxy changes: `npm run test:server` drives the shared contract fixture (`contract/agh-proxy.contract.json`) against the Express adapter, and `cargo test` runs the same fixture against the Rust adapter. A semantic proxy change must update the fixture first, then make both sides pass.
- Rust: `cd src-tauri && cargo test` — the contract runner self-hosts temporary origin servers and no longer needs `scripts/mock-agh.mjs` (the mock remains for local manual runs).
- iOS: generate and build the project via `scripts/ios-signing.sh` (it validates project settings after generation and automatically rebuilds a missing project before building); do not bypass the script by calling `xcodegen` or `tauri ios init` directly.
- Docs and proposals: `node scripts/verify-proposals.mjs`; add `--links` when referenced paths change.
- Pure `docs/` or `.agents/` changes do not need frontend or Rust tests.

## Branches and releases

- Direct-track small changes can be committed straight to `dev` and pushed; Noted-track changes merge into `dev` after proposal and PR review. Pushes to `dev` do not trigger a release.
- Only when releasing, merge `dev` into `main` and push it; do not push `main` for day-to-day work.
- Concrete run, check, and platform-generation commands are reached from the relevant `docs/README.md` fact pages; proposal validation is reached from the `.agents/README.md` pipeline docs.
