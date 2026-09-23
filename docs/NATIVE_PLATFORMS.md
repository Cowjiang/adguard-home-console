# 原生平台现状

## Tauri 2 壳

`src-tauri/` 为 React 前端提供 Windows、Android、macOS、iOS 壳。`src-tauri/src/lib.rs` 注册 `agh_fetch`；Rust 层复刻 Express 的路径映射、Basic Auth 透传、重定向、超时和错误语义。前端在运行时选择 Rust 命令或同源 Web 代理，见 [架构](architecture/README.md)。

Tauri iOS 使用 WKWebView，并接入原生 TabBar / 返回控件；React 页面负责内容及其路由。Tab 切换和子页返回的历史语义见 [交互约定](WEB_INTERACTION.md)。

## 纯 SwiftUI iOS

`ios/` 是独立原生线，`URLSession` 直接访问 AGH `/control/*`；无需 Web CORS 代理。SwiftUI 网络、状态与页面代码分别位于 `ios/AdGuardConsole/Network/`、`State/`、`Features/`。两条 iOS 线在同一仓库中并行存在；旧计划中“二选一”的表述是历史方案，不代表当前代码结构。

## 签名与生成

- 两条 iOS 线的签名值只放根目录被忽略的 `.env.signing`：`AGH_APPLE_TEAM` 和 `AGH_BUNDLE_ID`。
- `ios/project.yml` 与 `src-tauri/gen/apple/project.yml` 使用环境变量占位符。生成和构建走 `scripts/ios-signing.sh`，它在调用工具前检查变量。
- `*.xcodeproj` 是生成产物，不入库。克隆后先运行 `./scripts/ios-signing.sh generate ios` 或 `generate tauri`，再打开工程。
- `src-tauri/gen/apple/` 中的 `project.yml`、Swift 源、Info.plist、entitlements、资源等是维护内容，不能随生成工程一起忽略。
- `_probe/` 是本机忽略的 API 探查材料；原生测试不能假定克隆后存在这些文件。
