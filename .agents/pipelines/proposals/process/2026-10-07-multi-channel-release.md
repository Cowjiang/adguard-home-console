# 把发版拆成 GitHub Release / npm / GHCR 三个消费者

**Class:** process
**Status:** implemented
**Date:** 2026-10-07
**Updated:** 2026-10-07（实施完成；同日按用户决策把渠道定为 **nightly + stable**：首版曾实现「push main → dev」，因 `dev` 领先 `main` 58 个提交、`main` 只在发版时动，改成定时从 `dev` 出 nightly）
**Source:** 用户要求「调整 release 以适配 npx 和 docker 发版」

## Goal

现状只有一条真正跑通的发版线（推送 `main` → dev tag 的 GitHub Release + `agh-console.tar.gz`），而 `README.md` 已经把 Docker 与 npx 写成可用渠道。实测出三个阻断项：

1. **Docker 触发不到**：`docker-publish.yml` 只认 `v*.*.*` tag push，而 Release tag 由 `release.yml` 用 `GITHUB_TOKEN` 创建——GitHub 不为 `GITHUB_TOKEN` 派生的事件新建 run。按 glob，`v0.1.0-dev.20261007.abc1234` 也落在 `v*.*.*` 之内，一旦换成别的触发源，dev 构建就会被当成正式版并顶掉 `:latest`。
2. **npm 侧不存在发布链路**：`package.json` 是 `private`，没有 `bin`，也没有 `files`；npm 在没有 `.npmignore` 时回退 `.gitignore`，而 `dist` 正被忽略——实测 `npm pack` 打出 **347 项 / 10.3 MB**，含 `src/`、`src-tauri/`、`docs/`、`.agents/`，却**没有 `dist/index.html`**，装上只能看到 503「前端尚未构建」。
3. **版本三处不一致**：`package.json` `0.1.0`、`src-tauri/tauri.conf.json` `1.0.0`，镜像名与包名各自为政。

目标：三个渠道由一次构建喂饱，版本与产物同源，且每条渠道的产物都能在本地验证。

## Decision

1. **一条工作流、两条渠道、一次构建**。`release.yml` 改为 `prepare → build → {release, npm, docker}`：版本只在 `prepare` 算一次（`scripts/release-plan.mjs`），写回 `package.json` 后进入 tarball、npm tgz 与镜像标签。渠道由事件与 ref 判定：

   | 渠道 | 触发 | 版本 | Release | npm dist-tag | 镜像 tag |
   | --- | --- | --- | --- | --- | --- |
   | nightly | 定时任务（每天 UTC 19:17）从 `dev` 构建；也可 `workflow_dispatch` | `<package.json version>-nightly.<UTC YYYYMMDD>.<短 sha>` | tag `v<版本>`，prerelease，已存在则跳过 | `nightly` | `<版本>`、`nightly`、`sha-<短 sha>` |
   | stable | 推送 tag `vX.Y.Z` | `X.Y.Z`（取自 tag） | 同名 tag，upsert，正式版 | `latest` | `X.Y.Z`、`X.Y`、`latest`、`sha-<短 sha>` |
   | dry-run | `workflow_dispatch` | 同 ref | 不创建 | 不发布 | 只构建、不推送 |

   - **nightly 从 `dev` 取，不从 `main` 取**：实测 `dev` 领先 `main` 58 个提交，而 `main` 只在发版时被推送——从 `main` 出的"每日构建"只是上一次发版的快照，没有信息量。
   - **nightly 是 prerelease**：`releases/latest`（`scripts/server-pull.sh` 读的）、npm `latest`、镜像 `:latest` 都只属于 stable，nightly 不抢这三个位置。顺带把首版遗留的"服务器是否只跟 stable"从待定项变成默认行为。
   - **空转不发**：nightly 先比 `dev` HEAD 与上一个 nightly tag，相同就整条跳过，避免每天产出一个空版本和一次双架构构建。
   - **nightly 走测试门**：打包前跑 `pnpm check` / `pnpm test` / `npm run test:server` / `pnpm test:release`；nightly 是自用渠道，只发绿码。stable 不加这道门（沿用既有发布口径）。
   - **推送 `main` 不再发布任何东西**：发版动作明确为 `dev` → `main` 合并后打 `vX.Y.Z` tag 并推送。手推非 `vX.Y.Z` 的 tag（例如手推 nightly tag）会被 `prepare` 直接拒绝并说明原因。
   - **定时任务的落点约束**：`schedule` 只从默认分支取工作流定义并以其为事件 ref，所以 nightly 的 job 必须先合进 `main` 才会开始跑，且 workflow 里显式把构建 ref 解析成 `dev`、把 Release tag 的 `target_commitish` 指到该 commit（否则 tag 会落在 `main` 上，空转判定永远失效）。
   - `workflow_dispatch` 默认干跑（`publish=false`）：手动触发不再静默发布；补发显式设 `publish=true`。
2. **npm 包名定为 `agh-console`**，与镜像名、容器名、`/opt/agh-console`、systemd 单元、README 里已有的命令一致。`registry.npmjs.org` 对 `agh-console` 与 `adguard-home-console` 都返回 404（未被占用，2026-10-07 实测）。
   - `bin` 只放一个条目 `agh-console → server/index.mjs`（补 shebang）：npm exec 的规则是「包只有一个 bin 条目时就用它」，所以 `npx agh-console` 成立。
   - 仓库非公开（`api.github.com/repos/Cowjiang/adguard-home-console` 对匿名请求 404），而 npm 明示「私有仓库不生成 provenance」，所以首版用 `NPM_TOKEN` 且不加 `--provenance`；`NPM_TOKEN` 缺失时该 job 告警跳过，而不是把整条发版打红。
   - 发布物即验证物：CI 里 `npm pack` 出 tgz、`scripts/check-npm-pack.mjs` 断言内容后，`npm publish <tgz>`，发布阶段不重新打包。
   - npm 的 `latest` 只在第一个 stable 发布后才存在；在那之前 `npx agh-console` 会 ETARGET，需要先发一个 stable 或手动 `npm dist-tag add` 引导（已写进 docs）。
3. **镜像仍由 `Dockerfile` 自建**，保证 `docker build .` 可独立复现；构建阶段改 `--platform=$BUILDPLATFORM`，前端 bundle 与架构无关，不再在 arm64 的 QEMU 下重跑一遍。
4. **不动的部分**：仓库名、Cargo 名（`src-tauri/Cargo.toml`）与 iOS 工程名保持原样——iOS 工程名来自被跟踪的 `project.yml#name` 而不是 `package.json#name`，所以改 npm 包名不会动到 `scripts/ios-signing.sh` 里硬编码的 `adguard-home-console.xcodeproj`。

## Accept

- [x] `pnpm check`、`pnpm test`（40 例）、`pnpm build`、`npm run test:server`（17 例）全绿。
- [x] `pnpm check:pack`：tgz **10 项 / 677 KiB**，只含 `dist/`、`server/`（除测试文件）、`package.json`、`README.md`、`LICENSE`；改前是 347 项 / 10.3 MB 且缺 `dist/index.html`。
- [x] 把 tgz 解包到临时目录（借用宿主机 `node_modules`）后按 bin 的方式直接执行：`/api/health` 200、`/` 200（4048 字节 HTML）、SPA 回退 `/settings` 200，`dist` 在包内解析正确。
- [x] `bin` 的 shebang 与可执行位齐备（`npm pack` 报 mode 755，校验脚本断言两者）。
- [x] `pnpm test:release`：16 项断言覆盖 nightly / stable / dispatch / ref 告警 / 非法 tag / 非法 semver 与 sha。
- [x] 本地推演 prepare 步骤：`schedule` → ref 解析为 `dev`、channel=nightly、prerelease=true、镜像 tag 不含 `latest`；tag push → stable；dispatch 默认 `publish=false`。
- [x] 空转判定两条路径实测：无 nightly tag 时 `skip=false`；把 nightly tag 指到 `dev` HEAD 时 `skip=true`（临时 tag 已删除，仓库无残留）。
- [x] `actionlint`（v1.7.12）对 `release.yml` 零告警；YAML 可解析，触发器 = schedule / push tags / workflow_dispatch。
- [x] `docker-publish.yml` 退役，触发链不再依赖 `GITHUB_TOKEN` 创建的 tag。
- [x] `release-notes.sh` 的祖先 tag 匹配泛化到 `v[0-9]*.[0-9]*.[0-9]*`，nightly 与 stable tag 都作为基线（实测命中现存 dev tag）。
- [x] `node scripts/verify-proposals.mjs --links` 通过；`docs/engineering.md`、`docs/architecture/build-and-release.md`、`README.md`、`docs/assets/README.zh-CN.md`、`AGENTS.md` 与实现一致。
- [ ] 账号侧人工动作：npm 建 automation token 落到 `NPM_TOKEN`；GHCR 包设为 public，否则 README 里的匿名 `docker run` 会 401。
- [ ] 把本变更合进 `main` 后，定时任务才会开始触发；随后核对一次真实 nightly 的三个渠道版本一致（需要推送权限与 GitHub 侧环境）。

## Note

**本机验证边界**：无 docker daemon（镜像未构建），本机 pnpm 是 11.7.0 而仓库钉 `12.9.1`（corepack 版本门直接拒绝安装），因此 `--frozen-lockfile` 安装与镜像构建没有在本机复跑；`pnpm-lock.yaml` 未改动。前端检查用 `node_modules/.bin` 下的等价命令执行。GitHub Actions 未真实运行，工作流侧只做了 actionlint + 本地步骤推演。

**证据**
- GitHub 工作流语法：「Path filters are not evaluated for pushes of tags.」；schedule 事件「will only trigger a workflow run if the workflow file exists on the default branch」「Scheduled workflows will only run on the default branch」「can be delayed during periods of high loads… High load times include the start of every hour」——cron 定在 19:17 UTC 而非整点。
- npm exec 文档：包只有一个 `bin` 条目时就用该命令——`npx agh-console` 的依据。
- npm 文档：「Provenance generation is not supported for private repositories, even when publishing public packages.」
- `registry.npmjs.org/agh-console` → 404（未占用）；`api.github.com/repos/Cowjiang/adguard-home-console` → 404（仓库非公开）；`registry.npmjs.org/express` → 200 作为可达性对照。
- 分支形态：`dev` 领先 `main` 58 个提交，`main` 最近的推送是 2026-10-05（此前 09-28、09-27），即 `main` 只在发版时动——nightly 因此取 `dev`。
- 改前 `npm pack --dry-run` 的顶层分布：`src-tauri` 133、`src` 111、`.agents` 43、`docs` 19、`.local-backup` 15、`dist/index.html` 缺失。

**影响到的既有部署**：`scripts/server-pull.sh` 读 `releases/latest`，nightly 变成 prerelease 后它只跟 stable（这正是想要的默认）；要跟 nightly 需改成按 `v*-nightly.*` 在 `releases` 列表里挑最新。

**后续（不在本次）**
- 把纯前端依赖降到 `devDependencies`，缩短 `npx` 首次安装时间——需要重算 `pnpm-lock.yaml`，本机拿不到 pnpm 12，故不做。
- `src-tauri/tauri.conf.json`（1.0.0）与 npm 版本的统一；两者目前仍各自演进。
- 仓库转为 public 后开启 `--provenance` + trusted publishing，退掉长期 token。
