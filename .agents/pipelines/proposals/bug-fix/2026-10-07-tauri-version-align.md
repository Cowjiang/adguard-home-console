# 对齐 tauri crate 与 npm 的版本，退掉第三方 tao 补丁

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-07
**Source:** 2026-10-07 外部故障修复调查（用户选择方案 B）

## Goal

Tauri CLI 在 `build`/`dev`/`info` 上强制 crate 与 npm 的 major/minor 一致（crate 版本取自 `Cargo.lock`，npm 取自已安装依赖），不一致直接中止。`950fbd8`（pnpm 12 迁移）把 `@tauri-apps/api` 刷到 2.12.1，`Cargo.lock` 侧仍是 `tauri 2.11.6`，于是**桌面与 iOS 的 Tauri 构建全部编译前中止**。本次把 Rust 侧对齐到 2.12，顺带退掉 `[patch.crates-io] tao`（第三方 git 分支）。

## Decision

1. **升 Rust 侧，不动 npm**：`cargo update -p tauri --precise 2.12.1`，npm 侧保持 2.12.1。得到 tauri 2.12.1 / tauri-build 2.7.1 / tauri-codegen·macros 2.7.1 / tauri-utils 2.10.1 / tauri-runtime·runtime-wry 2.12.1 / wry 0.57.0 / tao 0.37.1；`objc2*` 不变，`tauri-plugin`（vendored 插件的 build 依赖）仍 2.6.3。
2. **退掉 `[patch.crates-io] tao`**：该补丁是 `0.35.3 + #1245` 的社区 backport（iOS 27 的 UIScene 场景配置被提前释放，只在 release 构建暴露）。已核实 tao 0.37.1 crate 内的 `platform_impl/ios/view.rs` 就是上游修复本身（`Retained::autorelease_ptr(config)`），且 `TaoSceneDelegate` 类名未变——`gen/apple` 的 Info.plist 契约不受影响。`Cargo.lock` 里已无任何 git 源。
3. **记录约束**：`docs/architecture/tauri-shell.md` 写明"crate 与 npm 必须同 minor，升一侧必须同时升另一侧（`@tauri-apps/cli` 同 minor）"，避免同一个 commit 再把两侧刷散。
4. **不改** npm 侧版本；`project.yml` 的 pre-build 脚本行与 release 链接配置不在本项内，与它同批修复（见同目录另外两份提案）。

## Accept

- [x] `cd src-tauri && cargo test` 通过（5 通过：4 单测 + 契约 runner）。
- [x] `cargo build --target aarch64-apple-ios` 与 `--target aarch64-apple-ios-sim` 均通过。
- [x] 桌面壳端到端构建通过（`pnpm exec tauri build --debug --no-bundle`，exit 0），且**版本门不再报错**。
- [x] `Cargo.lock` 中无 git 源、tao 只有 0.37.1 一条 registry 记录；`Cargo.toml` 的 `[patch.crates-io]` 只剩本仓插件。
- [x] `pnpm ios:build` 的版本门已消失（日志中无任何 version mismatch），并在同批修复（脚本行 + release 链接配置）后**产出 ipa**：`src-tauri/gen/apple/build/arm64/AGH Console.ipa`，3,414,883 字节，bundle id 与图标均正确，已安装到真机。
- [x] 运行时回归（按用户指示改用模拟器）：iOS 27 / iPhone 18 Pro 上，release 模拟器包（`scripts/ios-signing.sh tauri build --target aarch64-sim --ci`）连续 3 次冷启动均正常渲染登录页——#1245 的崩溃面（release 下 UIScene 场景配置提前释放）不再复现；debug 包自动登录后原生控件（tabbar、返回按钮、header action）与深浅外观均正常。真机版本仍可在设备信任证书后复跑（`pnpm ios:deploy`），不阻塞本项。

## Note

- **剩余阻碍（不在本次范围）**：
  1. `src-tauri/gen/apple/project.yml` 的 pre-build 脚本行在同一个 commit 里从 `npm run -- tauri ios xcode-script …` 改成了 `pnpm exec …`；`pnpm exec` 不改变 CWD 且会设置 `PNPM_PACKAGE_NAME`，tauri-cli 因此跳过自己的 chdir 兜底，从 `gen/apple` 向下找不到 `tauri.conf.json` 而 panic（`app_paths.rs:140`）。已验证修法：改回 `pnpm run -- tauri ios xcode-script …`（或前置 `TAURI_APP_PATH=$SRCROOT/../..`），改后需 `./scripts/ios-signing.sh generate tauri` 重生成工程。**修它之后才能跑通整包 ipa 与真机回归。**
  2. 设备签名：Xcode 登录后 `No Accounts` 消失，现在报 `Communication with Apple failed: Your team has no devices from which to generate a provisioning profile`——Personal Team 需要在签名的 Mac 上连接设备（Xcode 自动登记）或手工在开发者后台登记设备 UDID。
- 版本门本身提供 `--ignore-version-mismatches` 逃生开关，但其帮助文本写明"仅在确认是误报时使用"；本次是真错配，故走对齐而不是绕过。
- 依赖图变动较大（wry/tao/tauri-* 全部跨 minor），但本机编译、契约夹具与单测都未暴露 API 迁移问题；真正的风险面是 iOS 27 的 scene 运行时行为——已按用户指示在模拟器上以 release 包验证（见 Accept，冷启动 + 原生控件 + 深/浅外观），真机复跑改为可选补充。
