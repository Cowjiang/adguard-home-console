# 给 iOS 工程生成加门禁，并把可控项移进 tauri 配置

**Class:** process
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户要求（「tauri ios 线你要确保 icon 之类的每次 build 都不会丢失，是不是要配置 tauri config」）

## Goal

让 Tauri iOS 线的「工程生成」这一步失败可见、缺失可自愈：图标一类的东西不再可能因为生成环节静默出错而丢在产物里。

## Decision

1. **生成后硬校验**：`scripts/ios-signing.sh` 在生成工程后断言 pbxproj 含 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`、`DEVELOPMENT_TEAM`、`PRODUCT_BUNDLE_IDENTIFIER`、`IPHONEOS_DEPLOYMENT_TARGET = 15.0`，并断言 XcodeGen 预设已加载（哨兵 `CLANG_ENABLE_OBJC_ARC = YES`）。任一不满足即中止并打印成因与修法；xcodegen 输出里出现 `No "…" settings found` 时直接判定缺 `SettingPresets`。
2. **构建前自愈**：`tauri ios build` 从不重跑 xcodegen，pbxproj 一缺就是 `failed to read pbxproj file …` 的晦涩失败。构建路径改为：`project.yml` 在而 pbxproj 缺时自动 `xcodegen generate` + 上述校验，再继续构建；`project.yml` 也缺失（被误删）才报错并指向恢复步骤。
3. **`generate` 不再走 `tauri ios init`**：init 用 CLI 模板重写 `project.yml`，会把 `{{apple.development-team}}` 渲染成明文 team id 写进**被跟踪**文件——与 9-23 建立的 `.env.signing` 占位符设计直接冲突，且它还会去 `brew install` 依赖（本机 macOS 27 上必崩）。全新克隆真正缺的只有生成出来的 `*.xcodeproj`，`xcodegen generate` 足够。
4. **`bundle.iOS.minimumSystemVersion = "15.0"` 写进 `tauri.conf.json`**：部署目标以 `project.yml` 里的 `15.0` 为准，配置键与之同步，使「万一有人跑 init」时不会退回 Tauri 默认的 14.0（Xcode 27 拒绝该值）。
5. **图标资产本身可重建**：`npx tauri icon` 会从 `src-tauri/icons/` 重新写入 `gen/apple/Assets.xcassets/AppIcon.appiconset`，与第 1 条的构建设置校验一起构成「图标不会丢」的两层保障。

## Accept

- [x] 删掉 pbxproj 后 `npm run ios:build` 自动重建工程并构建成功（实测）
- [x] 生成的 pbxproj 含上述四项设置与预设哨兵；缺预设时脚本以可执行提示失败（实测负例）
- [x] 构建产出的 ipa 含 `Assets.car`、`AppIcon60x60@2x.png`，Info.plist 含 `CFBundleIcons`（实测）
- [x] `docs/` 记录新机制与恢复步骤（`docs/native-platforms.md`）

## Note

- 事实依据：XcodeGen 的 `share/xcodegen/SettingPresets/Product_Platform/application_iOS.yml` 提供 `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` 与 `CODE_SIGN_IDENTITY`。只把 `xcodegen` 二进制拷进 `PATH`（漏掉 `share/` 目录）时，生成物会**静默**缺少平台与产品默认设置——本次「ipa 里没有图标」故障的根因，详见 `.agents/logs/tauri-ios.md` §4。
- `tauri.conf.json` 能配置的与不能配置的：`bundle.iOS` 支持 `template`（自定义 XcodeGen `project.yml` 模板）、`developmentTeam`、`minimumSystemVersion`、`bundleVersion`、`frameworks`、`infoPlist`；**没有**恢复 iOS 应用图标的键——图标由 Asset Catalog + `ASSETCATALOG_COMPILER_APPICON_NAME` 决定，属工程规格层（`project.yml` / 生成门禁）。
- 未采纳（记录供后续取舍）：把 `bundle.iOS.template` 指向仓库自持的 `project.yml` 模板，可让 init 一次性产出含 AppIcon 的工程、彻底摆脱预设依赖；代价是冻结 Tauri 版本相关的工程结构，升级 CLI 后需自行对齐上游模板。当前选择「补丁 + 门禁」的轻方案。
- 未决（用户未表态）：`gen/apple/project.yml` 的 `sources: - path: Externals` 会把 release 构建后的 `libapp.a`（约 63 MB）当资源复制进 app 包 Resources 阶段，ipa 因此从 ~16 MB 涨到 ~22 MB；链接本身走 `dependencies: framework: libapp.a`，该复制是冗余。修法是给该 source 加 `excludes: ["**/*.a"]` 或 `buildPhase: none`。
