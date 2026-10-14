# 原生平台现状

**Status:** current
**Updated:** 2026-10-15

## Tauri 2 壳

`src-tauri/` 当前交付的是 **iOS 壳**；`src-tauri/gen/` 只有 apple 一套工程，`release.yml` 也只产 Web 产物。Windows / Android / macOS 桌面壳尚未交付（早期计划里列出过，未开工）；要做需另立提案，届时 `tauri-plugin-system-components` 里未启用的桌面/Android 实现才会被消费。

`src-tauri/src/lib.rs` 注册 `agh_fetch`；Rust 层复刻 Express 的路径映射、Basic Auth 透传、重定向、超时和错误语义。前端在运行时选择 Rust 命令或同源 Web 代理，见 [架构](architecture/README.md)。

Tauri iOS 使用 WKWebView，并接入原生 TabBar / 返回胶囊 / 顶栏操作按钮（液态玻璃）；React 页面负责内容及其路由。原生控件悬浮在 WebView 之上、不参与页面平移，故出场为「转场过半后原地淡入」，且其明暗显式跟随**应用主题**（`set_appearance`），不随系统外观。Tab 切换和子页返回的历史语义见 [交互约定](web-interaction.md)。

iOS 只有这一条线。2026-09-24 起原先并行的纯 SwiftUI 线退役：代码与历史都不删除，完整保留在 `archive/ios-native-swift` 分支（tip = 退役前的 `dev`）；`dev` 与 `main` 不再包含 `ios/`。

## 签名与生成

- 签名值只放根目录被忽略的 `.env.signing`：`AGH_APPLE_TEAM` 和 `AGH_BUNDLE_ID`。**bundle id 的规范值是 `com.cowjiang.aghconsole`**（= `src-tauri/tauri.conf.json#identifier`，也是 CI 未配变量时的兜底）：本机 `.env.signing` 与仓库变量 `AGH_BUNDLE_ID` 都应与它同值——不同值时，本地构建的包与 CI 的包在设备上会变成两个应用，而 App Store 的 bundle id 全局唯一、注册后不可更换。
- `src-tauri/gen/apple/project.yml` 使用 `${...}` 占位符。生成和构建走 `scripts/ios-signing.sh`，它在调用工具前检查变量。
- `*.xcodeproj` 是生成产物，不入库。克隆后先运行 `./scripts/ios-signing.sh generate tauri`，再打开工程；日常构建用 `pnpm ios:build`。
- 部署目标是 `src-tauri/gen/apple/project.yml` 里的 `15.0`（Xcode 27 拒绝 Tauri 默认的 14.0）；`src-tauri/tauri.conf.json` 的 `bundle.iOS.minimumSystemVersion` 与之保持同值。`generate` 只跑 `xcodegen`，**不**调用 `tauri ios init`：init 会重写 `project.yml` 并把 `{{apple.development-team}}` 渲染成明文 team id 写进被跟踪文件。
- **生成是被校验的一步**（2026-09-24 起）：脚本生成后断言 pbxproj 含 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`、`DEVELOPMENT_TEAM`、`PRODUCT_BUNDLE_IDENTIFIER`、`IPHONEOS_DEPLOYMENT_TARGET = 15.0`，以及预设哨兵 `CLANG_ENABLE_OBJC_ARC = YES`；任一不满足即中止并打印修法。原因是 XcodeGen 缺 `share/xcodegen/SettingPresets` 时会**静默**产出缺这些设置的工程，装出来的 ipa 会没有图标。构建路径同样先跑这套校验，且 pbxproj 缺失时按 `project.yml` 自动重建后继续（`tauri ios build` 自己不会重跑 xcodegen）。
- 图标的两个来源都可重建：`gen/apple/Assets.xcassets/AppIcon.appiconset` 由 `npx tauri icon` 从 `src-tauri/icons/` 重新生成；选中它的构建设置来自 XcodeGen 预设，由上面那套校验兜底。验收看产物：ipa 里应有 `Assets.car` 与 `AppIcon60x60@2x.png`，Info.plist 应有 `CFBundleIcons`。
- `src-tauri/gen/apple/` 中的 `project.yml`、Swift 源、Info.plist、entitlements、资源等是维护内容，不能随生成工程一起忽略。
- `_probe/` 是本机忽略的 API 探查材料；原生测试不能假定克隆后存在这些文件。
