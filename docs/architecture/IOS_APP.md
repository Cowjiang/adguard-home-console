# SwiftUI iOS 应用

`ios/` 是与 Web 并行的原生线：纯 SwiftUI + `URLSession` 直连 AGH `/control/*`，不经代理。它与 Tauri iOS 壳在当前代码里并存，不是二选一关系。

代码入口：`ios/AdGuardConsole/AdGuardConsoleApp.swift`、`ios/AdGuardConsole/Network/APIClient.swift`、`ios/AdGuardConsole/Models/Models.swift`、`ios/AdGuardConsole/State/AppSession.swift`。

## 应用结构

- 入口 `AdGuardConsoleApp`：单个 `WindowGroup` 承载 `RootView`，注入 `AppSession` 环境对象与配色方案；`scenePhase` 变为 active 时刷新状态，离开时取消暂停倒计时。
- `RootView` 按 `session.isLoggedIn` 在 `MainTabView` 与 `LoginView` 之间切换，启动时执行 `session.bootstrap()`。
- 导航为 `TabView` + 四个 tab（概览、过滤器、日志、设置），每个 tab 自带 `NavigationStack`。
- 页面模型 `OverviewModel`/`FiltersModel`/`QueryLogModel` 由页面以 `@State` 持有并各自缓存 `APIClient`；跨页共享只走 `AppSession`。
- 过滤器与设置里的若干管理入口当前是 `FeaturePlaceholderView` 占位。

## 网络层

- `APIClient` 是 `Sendable` 值类型，持有连接配置，不依赖第三方网络库。
- URL 由配置 origin + `control` + path 拼出，query 走 `URLComponents`，body 走 `JSONEncoder`。
- 认证为 `Authorization: Basic base64(user:password)`；传输用 `URLSession.shared`，无自定义 session 或代理。
- 非 2xx 抛 `APIError.http`，401/403 给统一文案；错误正文先按 `{error,message}` 解，失败则取响应前 200 字节。
- 没有重试；超时与其它网络错误分开映射。已封装 status、stats、clients、filtering、protection、safebrowsing、parental、querylog 等端点，`longTaskTimeout` 已定义但无调用点。
- `Info.plist` 允许明文 HTTP，以便直连局域网内的 AGH。

## 模型与契约

- 模型集中在 `Models.swift`，字段用 `CodingKeys` 显式映射。
- 与 Web 端共用同一套归一化：`protection_disabled_duration` 为毫秒、`start_time` 用 `Double`（真实响应带小数）、`KVMap` 兼容单键数组与字典、`avg_processing_time` 与 `top_upstreams_avg_time` 为秒、`passedCount` 对齐 `Dashboard.tsx`、`FilteringStatus.interval` 单位是小时、`whitelist_filters` 为 null 时归一为空数组、`RewriteList` 兼容裸数组与 `{servers:[]}`。
- 拦截原因与日志筛选的元数据对齐 `src/lib/constants.ts`，格式化语义对齐 `src/lib/format.ts`。

## 状态与存储

- 连接配置（含密码）存 Keychain（service `com.adguardhome.console`，account `svr_configs.v1`），不使用 UserDefaults。
- 主题偏好存 UserDefaults 键 `agh.console.theme.v1`。
- `AppSession` 是 `@MainActor @Observable`，持有当前配置、状态、配置列表、主题、暂停到期时间与错误文案；登录判定为 `GET /status` 且 `version` 非空。
- 轮询节奏：概览 stats 5 秒、clients 60 秒节流，查询日志 2 秒；进后台停止，回前台立即刷新。

## 界面实现

- 不使用毛玻璃材质：卡片是实色底 + 1pt 边框 + 连续圆角；深浅色经 `UIColor { trait in }` 动态解析。
- 以原生控件为主：`Toggle`、`Menu`、`.searchable`、`.refreshable`、`.presentationDetents`；图表用 Swift Charts（`SectorMark` 环图、`AreaMark`/`LineMark` 趋势），分段控件用 `matchedGeometryEffect`。
- 本线没有自定义返回手势或转场实现；侧滑返回由系统 `NavigationStack` 提供（WKWebView 那套转场在 Tauri 线，见 `docs/WEB_INTERACTION.md`）。

## 测试

- 单元测试 `DecodeTests` 用 7 份 JSON 夹具覆盖解码与契约回归：毫秒字段、RFC3339、`KVMap` 双形态、`interval` 小时、`start_time` 浮点、`whitelist` 为 null、`RewriteList` 双形态、clients、错误映射。
- UI 测试两个用例：四 tab 走查并留截图；定时暂停 3 小时后断言倒计时再恢复。启动时用环境变量注入 mock 地址与凭据（`AGH_URL`、`AGH_USERNAME`、`AGH_PASSWORD`、`AGH_AUTOCONNECT`）。

## 工程生成与签名

- `ios/project.yml` 是 XcodeGen 输入，定义应用、单元测试、UI 测试三个 target；Swift 6、strict concurrency、iOS 26、仅 iPhone。
- `DEVELOPMENT_TEAM` 与 `PRODUCT_BUNDLE_IDENTIFIER` 是 `.env.signing` 提供的占位符，`*.xcodeproj` 不入库。
- 生成走 `./scripts/ios-signing.sh generate ios`；脚本先校验 `AGH_APPLE_TEAM`、`AGH_BUNDLE_ID` 非空——XcodeGen 对未解析的 `${...}` 不报错，会静默产出坏工程。
- `scripts/ios-deploy.sh` 面向 Tauri 的 IPA，本线没有对应的部署脚本；`scripts/simtap.swift` 是本地验证工具（文件头标注不入库），向 Device Hub 窗口注入鼠标事件模拟触摸。
