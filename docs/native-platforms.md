# 原生平台现状

**Status:** current
**Updated:** 2026-10-18（补记 Windows 桌面壳的打包与签名口径；当日又把它接进 `release.yml` 的 `windows` job）

## Tauri 2 壳

`src-tauri/` 当前交付的是 **iOS 壳**与 **Windows 桌面安装包**；`src-tauri/gen/` 只有 apple 一套工程。`release.yml` 的 `windows` job（`windows-latest`）跑 `pnpm tauri build`，产 NSIS 与 MSI 两件安装包（资产名固定 `agh-console-setup.exe` / `agh-console.msi`），与 tarball、npm、镜像、ipa 同源同 ref；安装包**未签名**（没有 Windows 代码签名证书），首次运行有 SmartScreen 提示，改为 per-user 安装、无需管理员权限。产物走 Rust `agh_fetch` 代理，运行时不依赖 Node server；Android / macOS 桌面壳仍未开工。窗口尺寸按桌面布局钉住，见 [Tauri 2 壳](architecture/tauri-shell.md)。`tauri-plugin-system-components` 的桌面实现只覆盖 macOS，Windows 上其命令一律返回 `Unsupported`，前端回落 HTML 控件（启动时会打印一条原生标签栏不可用的警告，属预期）。

`src-tauri/src/lib.rs` 注册 `agh_fetch`；Rust 层复刻 Express 的路径映射、Basic Auth 透传、重定向、超时和错误语义。前端在运行时选择 Rust 命令或同源 Web 代理，见 [架构](architecture/README.md)。

Tauri iOS 使用 WKWebView，并接入原生 TabBar / 返回胶囊 / 顶栏操作按钮（液态玻璃）；React 页面负责内容及其路由。原生控件悬浮在 WebView 之上、不参与页面平移，故出场为「转场过半后原地淡入」，且其明暗显式跟随**应用主题**（`set_appearance`），不随系统外观。Tab 切换和子页返回的历史语义见 [交互约定](web-interaction.md)。

iOS 只有这一条线。2026-09-24 起原先并行的纯 SwiftUI 线退役：代码与历史都不删除，完整保留在 `archive/ios-native-swift` 分支（tip = 退役前的 `dev`）；`dev` 与 `main` 不再包含 `ios/`。

## 签名与生成

- 签名值只放根目录被忽略的 `.env.signing`：`AGH_APPLE_TEAM` 和 `AGH_BUNDLE_ID`。**bundle id 的规范值是 `com.cowjiang.aghconsole`**（= `src-tauri/tauri.conf.json#identifier`，也是 CI 未配变量时的兜底）：本机 `.env.signing` 与仓库变量 `AGH_BUNDLE_ID` 都应与它同值——不同值时，本地构建的包与 CI 的包在设备上会变成两个应用，而 App Store 的 bundle id 全局唯一、注册后不可更换。
- `src-tauri/gen/apple/project.yml` 使用 `${...}` 占位符。生成和构建走 `scripts/ios-signing.sh`，它在调用工具前检查变量。
- `*.xcodeproj` 是生成产物，不入库。克隆后先运行 `./scripts/ios-signing.sh generate tauri`，再打开工程；日常构建用 `pnpm ios:build`。
- 部署目标是 `src-tauri/gen/apple/project.yml` 里的 `15.0`（Xcode 27 拒绝 Tauri 默认的 14.0）；`src-tauri/tauri.conf.json` 的 `bundle.iOS.minimumSystemVersion` 与之保持同值。`generate` 只跑 `xcodegen`，**不**调用 `tauri ios init`：init 会重写 `project.yml` 并把 `{{apple.development-team}}` 渲染成明文 team id 写进被跟踪文件。
- **生成是被校验的一步**（2026-09-24 起）：脚本生成后断言 pbxproj 含 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`、`DEVELOPMENT_TEAM`、`PRODUCT_BUNDLE_IDENTIFIER`、`IPHONEOS_DEPLOYMENT_TARGET = 15.0`，以及预设哨兵 `CLANG_ENABLE_OBJC_ARC = YES`；任一不满足即中止并打印修法。原因是 XcodeGen 缺 `share/xcodegen/SettingPresets` 时会**静默**产出缺这些设置的工程，装出来的 ipa 会没有图标。构建路径同样先跑这套校验，且 pbxproj 缺失时按 `project.yml` 自动重建后继续（`tauri ios build` 自己不会重跑 xcodegen）。生成前脚本还会先建好 `Externals/` 与 `assets/`：这两个目录由 `project.yml` 声明为 source，但 git 都带不过来（前者被本目录 `.gitignore` 排除，后者是空目录），只能由构建填充，而全新克隆一个都没有——缺了 xcodegen 会以 `Spec validations errors` 拒绝生成，CI 曾因此在 `ios` job 上首次运行即失败。xcodegen 自身失败时脚本先打印它的原始输出再中止，不只留一个退出码。
- 图标的两个来源都可重建：`gen/apple/Assets.xcassets/AppIcon.appiconset` 由 `npx tauri icon` 从 `src-tauri/icons/` 重新生成；选中它的构建设置来自 XcodeGen 预设，由上面那套校验兜底。验收看产物：ipa 里应有 `Assets.car` 与 `AppIcon60x60@2x.png`，Info.plist 应有 `CFBundleIcons`。
- **Windows 图标是另一份源**：`icons/app-icon-windows.svg`（超椭圆盘面 + 透明边距，指数 5.5、盘面占 900/1024）。Windows 不给 Win32 图标自动遮罩，满幅方形会让任务栏与标题栏变成硬边矩形，所以这条不能与 `icons/app-icon-shield.svg`（满幅，供 iOS/Android/PWA 使用，那些平台由系统自己遮罩）混用。`icon.ico` 由它生成并回填：`npx tauri icon src-tauri/icons/app-icon-windows.svg -o <临时目录>`，只取其中的 `icon.ico`。两个易踩的点：resvg 解析的 XML 注释里不能出现 `--`（写 `-o` 而不是 `--output`），且 `tauri icon` 的输入尺寸必须是 1024 见方。
- **版本号**：应用包的系统版本来自工程 Info.plist 的 `CFBundleShortVersionString`/`CFBundleVersion`，由 `project.yml` 的 `info.properties` 经 xcodegen 生成——所以改 `project.yml` 的版本后同样要重生成工程。发版时 `release-plan.mjs --set-version <版本> <build>` 会写这两项：plist 只接受 1–3 段纯数字（cargo-mobile2 逐段 `parse::<usize>()`，否则 `BundleVersionInvalid`），因此写的是**核心版本**（nightly 的 `0.1.0-nightly.<日期>.<sha>` → `0.1.0`）加数字 build（CI 传 `github.run_number`，同核心版本的 nightly 在设备上可区分）；完整版本号出现在应用内「关于」页。
- `src-tauri/gen/apple/` 中的 `project.yml`、Swift 源、Info.plist、entitlements、资源等是维护内容，不能随生成工程一起忽略。
- `_probe/` 是本机忽略的 API 探查材料；原生测试不能假定克隆后存在这些文件。
- **CI 也产 ipa**：`release.yml` 的 `ios` job（`macos-latest`）跑 `./scripts/ios-signing.sh tauri build --target aarch64 --no-sign`，产物 `agh-console.ipa` 挂进 Release——命令与本地 `pnpm ios:build` 只差 `--no-sign`。签名值不必进 CI：`AGH_APPLE_TEAM` / `AGH_BUNDLE_ID` 从仓库变量读，未设置时分别兜底为 `unsigned` 与 `tauri.conf.json` 的 `identifier`（不签名的构建里 team 只是 XcodeGen 占位符）；要用签名包时签名材料走 tauri-cli 的 `IOS_CERTIFICATE` / `IOS_CERTIFICATE_PASSWORD` / `IOS_MOBILE_PROVISION` 环境变量，它会把工程切成 Manual 签名。iOS 只在 stable、手动 `workflow_dispatch`，或（nightly 且仓库公开）时构建，原因见 [构建与发布](architecture/build-and-release.md)。
