# 让应用内显示的版本与发版版本同源

**Class:** process
**Status:** implemented
**Date:** 2026-10-15
**Source:** 用户发现「关于」页显示的版本与当前 tag 不对应，要求一并对齐

## Goal

应用内「关于」页显示的 `v1.0.0` 是 `src/lib/constants.ts` 里的**字符串字面量**，与任何 tag 都没有关系：当前标签线是 `v0.1.0` 与滚动 `nightly`（`0.1.0-nightly.<日期>.<短 sha>`）。仓库里同时并存四份版本声明，而发版时只有 `package.json` 会被写成发版版本（`scripts/release-plan.mjs --set-version`），于是 tarball / npm / 镜像里 `package.json` 是对的、界面显示的却是写死的 1.0.0。

目标：应用内显示与 iOS 包的系统版本都由**发版计划算出的那一个版本**派生；仓库里的声明值彼此一致，不再各说各话。

## Decision

1. **单一来源是发版版本**（`release-plan.mjs` 算出的 stable `X.Y.Z` / nightly `<基线>-nightly.<UTC 日期>.<短 sha>`）；前端不再存字面量。`vite.config.ts` 用 Vite `define` 注入 `__APP_VERSION__`（优先取环境变量 `APP_VERSION`，没有则读 `package.json#version`），`constants.ts` 的 `APP_VERSION` 直接引用该全局；全局类型声明放 `src/types/app-version.d.ts`。本地 `pnpm dev` / `pnpm build` 因此显示 `package.json` 的版本，CI 里因为在 `pnpm build` 之前 stamp，显示的就是发版版本。取环境变量优先是为了让镜像构建不必改上下文里的 `package.json`（见第 3 条）。
2. **`--set-version` 从「只写 package.json」扩成「写所有版本声明」**：`package.json`、`src-tauri/tauri.conf.json`（同值）、`src-tauri/gen/apple/project.yml` 的 `CFBundleShortVersionString`（取**核心版本**，丢弃 nightly 的 prerelease 后缀）与 `CFBundleVersion`（可选的数字 build）。核心版本的必要性：cargo-mobile2 读工程 Info.plist 的 bundle version 时要求每一段纯数字（否则 `BundleVersionInvalid`），Apple 的 `CFBundleShortVersionString` 也只接受 1–3 段数字，nightly 的 `-nightly.<日期>.<sha>` 进不去——差异由 `CFBundleVersion` 承担，CI 传 `github.run_number`（单调递增，同核心版本的 nightly 在设备上因此可区分）。
3. **镜像走 build-arg 而不是改上下文**：`Dockerfile` 的 build 阶段在 `RUN pnpm build` 之前 `ARG APP_VERSION`，workflow 用 `build-args` 把发版版本传进去。只让 `pnpm build` 那一层失效；若改成在 job 里 stamp 上下文里的 `package.json`，`pnpm install --frozen-lockfile` 的缓存层每次发版都会重跑。
4. **仓库声明值就地收敛到当前版本线 0.1.0**：`tauri.conf.json` 与 iOS 工程的 `1.0.0` 改成 `0.1.0`，与 `package.json` 一致。本地构建因此与 CI 同一条线，不再是「本地 1.0.0、CI 发版版本」。
5. **`src-tauri/Cargo.toml` 不动**：crate 版本不出现在任何产物、界面或包元数据里（tauri 取的是 `tauri.conf.json#version`），改它要连带刷 `Cargo.lock`——留到桌面/Android 线开工时与包名一起定。
6. **改 `project.yml` 后仍按既有约定重生成工程**：iOS 的系统版本来自工程 Info.plist，而它由 xcodegen 从 `project.yml` 的 `info.properties` 生成；`scripts/ios-signing.sh` 在 CI（无 pbxproj）与本地缺工程时都会重建，文档已写明这一约定。

## Accept

- [x] 前端不再有版本字面量：`pnpm check`（tsc，含新的全局声明）、`pnpm test`、`pnpm build` 通过。
- [x] 注入路径实测：本地 `pnpm build` 后产物里的版本 = `package.json#version`（0.1.0）；`APP_VERSION=0.1.0-nightly.20261015.abc1234 pnpm build` 后产物里是发版版本串。
- [x] `--set-version` 在隔离副本上实测：`package.json`、`tauri.conf.json`、`project.yml` 三处都写成预期值，核心版本与 build 号的映射进了 `--self-test` 断言。
- [x] `release-plan.mjs --self-test` 通过；actionlint 对 `release.yml` 零告警；`verify-proposals.mjs` 通过。
- [x] 仓库声明值一致：`package.json` 0.1.0 = `tauri.conf.json` 0.1.0 = iOS 工程 0.1.0。
- [ ] 真实发版后核对：tarball / npm / 镜像 / ipa 的「关于」页都等于该渠道的版本，iOS 系统信息里显示核心版本 + build 号。

## Note

**约束与证据**
- iOS 侧的两条硬约束：Apple 的 `CFBundleShortVersionString` 只接受 1–3 段数字；cargo-mobile2 0.22.5 读工程 Info.plist 的 bundle version 时逐段 `parse::<usize>()`，不通过即 `BundleVersionInvalid`（`apple/config/mod.rs`）。所以 nightly 的完整版本只能进应用界面，进不了系统版本号——这是第 2 条拆成「核心版本 + 数字 build」的原因。
- `define` 的替换发生在构建期，`dist` 里的版本字符串是死值：dev server 与测试里 `__APP_VERSION__` 解析为 `package.json#version`，只有 stamp 过的构建才带发版版本。
- 镜像的 `ARG APP_VERSION` 只影响 build 阶段的 `pnpm build` 层：ARG 未传时（例如本地 `docker build .`）回落到上下文 `package.json` 的版本，因此该命令依旧自洽。

**解掉的既有后续项**：2026-10-07 的多渠提案里「`src-tauri/tauri.conf.json`（1.0.0）与 npm 版本的统一；两者目前仍各自演进」由本次落地。
