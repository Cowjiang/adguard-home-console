# 弃用并移除 SwiftUI 原生 iOS 线

**Class:** simplification
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户要求（「原生 Swift 线可以被弃用了，tauri ios 线是目前最终方案，理应从 main 和 dev 分支移除 Swift 原生线……」）

## Goal

把 iOS 交付面收敛到 Tauri 壳一条线：从 `dev` 与 `main` 移除 `ios/`（XcodeGen 工程规格、Swift 源码、Tests/UITests、资源）以及它在文档、脚本、`.gitignore`、`package.json` 中的引用；Swift 线本身不消失——保留在 `archive/ios-native-swift` 分支，随时可检出。

## Decision

- **保留方式用分支快照**：`archive/ios-native-swift` 的 tip 是移除前的 `dev`，含完整 Swift 线与全部历史；不建归档目录、不改写 git 历史。
- **文档按「当前事实」处理**：`docs/architecture/` 分册里的 SwiftUI iOS 应用页（`ios-app.md`，整页删除）；`docs/native-platforms.md`、`docs/architecture/README.md`、`docs/architecture/build-and-release.md`、`docs/README.md`、`AGENTS.md` 一律只描述 Tauri 壳。
- **过程材料原样保留**：`.agents/logs/ios-native.md`、`orchestration.md`、`transcript-2026-09-21.md`、`.agents/reviews/*` 是当时的记录，不追改，也不当作现行规格。
- **顺带消除的冲突**：Swift 线与 Tauri 壳曾共用 bundle id `com.adguardhome.console`（`.agents/logs/tauri-ios.md` 记为遗留风险）；线移除后该风险不再存在，`.env.signing` 的 `AGH_BUNDLE_ID` 由 Tauri 线独占。

## Accept

- [x] `ios/` 从工作树与 `dev`、`main` 中消失；`archive/ios-native-swift` 分支保留完整 Swift 线
- [x] `scripts/ios-signing.sh` 不再提供 `generate ios`；`package.json` 的 `ios:clean` 不再引用 `AdGuardConsole-*`
- [x] `docs/`、`AGENTS.md`、`scripts/` 内部不再出现把 SwiftUI 线描述为当前实现的文字，也不再有 `ios/AdGuardConsole`、`generate ios` 之类残留引用
- [x] `node scripts/verify-proposals.mjs --links` 通过（无指向已删页面的链接）
- [x] Web 与 Tauri 线不受影响：`npm run check`、`npm run build` 通过

## Note

- 消费者审计（实施前普查，逐处落点）：`AGENTS.md:3,25,26,40,41`；架构分册的 SwiftUI iOS 应用页（整页 56 行）；`docs/architecture/README.md:13,22`；`docs/native-platforms.md:12–20`；`docs/architecture/build-and-release.md:20`；`docs/README.md:13`；`docs/engineering.md:40`；`scripts/ios-signing.sh:12,55–58`；`scripts/mock-agh.mjs:2`；`package.json:16`；`.gitignore:13,14,23`。
- 不在范围内：`src-tauri/plugins/tauri-plugin-system-components/ios/` 是插件自带的 iOS 源码目录，与本线无关（普查中的同名干扰项）。
- 仓库根的 `README.md` 从未描述 Swift 线（只写 Web/PWA），无需改动。
- 退役后 iOS 侧只剩一条线，`docs/native-platforms.md` 的「两条线」表述与「二选一」历史都被替换为单一现状描述。
