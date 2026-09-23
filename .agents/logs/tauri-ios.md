# Tauri iOS 施工日志(Phase 5.5 混合壳线)

> 2026-09-21。按 `.agents/reviews/2026-09-23-tauri-platform-plan-snapshot.md` Phase 5.5 施工:Tauri 2 壳 + 现有 React 前端 + Rust 代理 + 社区原生液态玻璃 TabBar 插件 spike。
> 与 `ios/`(纯 SwiftUI 线)完全独立,本线不触碰 `ios/` 目录。

## 1. 环境装配

实际机器:macOS 27.0 arm64,Xcode 27.0 (27A266a),iOS 27.0 SDK + 模拟器 runtime。测试设备:模拟器「iPhone 18 Pro」。

| 项 | 结果 | 说明 |
| --- | --- | --- |
| npm install | ✓ | 155 包,3s |
| Rust iOS targets | ✓(绕道) | 见下「坑 A」 |
| tauri-cli | ✓(npm 版) | 见下「坑 B」 |

**坑 A:rustup 镜像且无视环境变量。** 本机 `~/.zshrc` 配了 `RUSTUP_DIST_SERVER=https://mirrors.aliyun.com/rustup`,该镜像缺 `rust-std-1.89.0-aarch64-apple-ios`(404)。更怪的是这个 rustup 1.28.2 二进制**完全无视 `RUSTUP_DIST_SERVER` 覆盖**:`env -i` 干净环境、指向官方源、甚至指向死端口 `http://127.0.0.1:1` 都照样去请求 aliyun(死端口应立刻 connection refused,却仍报 aliyun 404),二进制 `strings` 里也搜不到 aliyun 字样——疑似被改写过的 rustup。不改用户 rustup,绕道:**手动从 `static.rust-lang.org/dist/2025-08-07/` 下载三个 rust-std tar.xz,解压后用组件自带 `install.sh --prefix=~/.rustup/toolchains/stable-aarch64-apple-darwin` 离线装入现有 toolchain**。验证:`rustc --print target-libdir --target aarch64-apple-ios-sim` 正常;临时 hello 工程 `cargo build --target aarch64-apple-ios-sim` 产出 arm64 Mach-O。
**坑 B:brew 在 macOS 27.0 上整体不可用。** 任何 brew 命令启动即崩:`unknown or unsupported macOS version: "27.0"`(Homebrew 的 macos_version.rb 还没收录 27)。原计划 brew 装 tauri-cli 不可行,改用官方 npm 包 `@tauri-apps/cli@2.11.5`(预编译二进制,非 cargo install,装完 3s,与 brew 等价的 CLI 本体)。devDependency 记录在 package.json。
**附带发现:`~/.cargo/config` 把 crates.io 换成 ustc 的 git:// 索引**,后续 cargo 拉依赖如遇 git 协议不通需改 sparse(见 §3)。

## 2. mock 服务器核对

`http://127.0.0.1:3990`(scripts/mock-agh.mjs,由并行任务管理,未改动未重启)。抽查 `GET /control/status`(admin:demo)返回 v0.107.79 结构,`protection_enabled:true`,`start_time` 毫秒。模拟器可直接访问宿主 127.0.0.1。

## 3. Rust 侧(src-tauri/)

接手时已有 `proxy.rs`(核心逻辑完整可用)与 `capabilities/default.json`,缺入口文件与图标。补齐如下:

| 文件 | 处理 |
| --- | --- |
| `src-tauri/src/proxy.rs` | 保留实现;修一处测试 bug(迷你服务器 `Content-Length: 13`,body 实为 14 字节,截断断言失败);`redirect_origin` 三处断言按 URL origin 序列化语义(无尾斜杠,与 `new URL().origin` 一致)修正;`Deserialize`/`error_body` 死代码清理 |
| `src-tauri/src/lib.rs` | 新增:`mod proxy` + `#[cfg_attr(mobile, tauri::mobile_entry_point)] run()`,注册 `agh_fetch` 与 `get_debug_login`(debug 自动登录,读 `AGH_URL/AGH_USERNAME/AGH_PASSWORD` 环境变量,release 恒 None,不落日志) |
| `src-tauri/src/main.rs` | 新增:桌面入口,调 `adguard_home_console_lib::run()` |
| `Cargo.toml` | tokio features 补 `net/io-util/time`(单测自起 TCP 服务器需要) |
| `.cargo/config.toml` | **新增项目级覆盖**:用户 `~/.cargo/config` 的 ustc 索引是 `git://`(9418,常被墙),本项目改 sparse 协议 `sparse+https://mirrors.ustc.edu.cn/crates.io-index/`,实测直连 0.13s,未动用户全局配置 |
| `icons/` | `npx tauri icon` 全套生成(源图为 Node 手写 PNG 编码器产出的 1024×1024 占位图:深色圆角方块 + 绿蓝渐变 + 白盾,无设计投入,后续可换正式源图重跑) |

编译/测试结果:
- `cargo build` 通过(dev profile,4.7s 增量;依赖经 ustc sparse 拉取成功,未走 git 协议,未用代理)。
- `cargo test` **11 通过 / 0 失败**,含:路径归一、upstream 拼接(含 target 带路径、非 http 拒绝)、308 origin 替换、超时分档、对 mock 的冒烟(200 转发、无凭据 401、缺 target 400、POST /protection 透传+回读)、自起 TCP 服务器的 308 整体换 origin、3 跳重定向后原样返回、超时 502。
- `cargo clippy` 无告警(仅剩 cargo 对用户 `~/.cargo/config` 文件名的弃用提示,属用户配置,不动)。

行为对齐核对(对照 `server/index.mjs proxyAGH`):301/302/307/308×3、location 只取 origin、25s/120s 超时、非 GET 透传 JSON、502 `{"error":...}`、响应体原样 text+content-type 回传、无任何请求头日志——均一致。

## 4. 前端适配与 iOS 工程

- **api.ts(计划内,唯一必改)**:探测 `window.__TAURI_INTERNALS__` → `invoke('agh_fetch', { method, target, authHeader, pathWithQuery, bodyJson })`,把返回的 `{status, content_type, body_text}` 按 fetch 语义归一(`!2xx → ApiError(status, data?.error || …)`;IPC 异常归一为 502)。浏览器路径原样保留,`tsc` 零错。AbortSignal 在 Tauri 分支不支持(SWR 可接受)。
- **tauri ios init(坑 C)**:`gen/apple` 生成成功,但 cargo-mobile2 依赖探测把 `libimobiledevice` 的 bin 名写死为 `idevicesyslog`,缺失就走 `brew install`(macOS 27 必崩)。绕过:在 PATH 前置 stub `/tmp/tauri-stub-bin/idevicesyslog`(exit 0 的空脚本;仅骗过探测,模拟器链路不使用真机 syslog 工具),xcodegen 用 `/tmp/xcodegen/bin/xcodegen`(并行任务下载的 2.46.0),pod 1.12.1 已在本机。产物:`adguard-home-console.xcodeproj`(bundle id `com.adguardhome.console`)。
  - **2026-09-23 更正(绕过手段已作废)**:本机 brew 恢复可用,`tauri ios init` 会自行 `brew install` 所需依赖(含 xcodegen 2.46.0 → `/opt/homebrew/bin/xcodegen`),**不需要** `idevicesyslog` stub,也不需要 `/tmp/xcodegen`;两个 /tmp 路径均已随临时目录清理。另:签名与 Bundle ID 现由 `project.yml` 占位符 + `.env.signing` 提供,见 `.agents/reviews/2026-09-23-project-memory-snapshot.md` §12。
- **图标**:`npx tauri icon` 生成全套(见 §3)。

## 5. 插件 spike:tauri-plugin-system-components(主选,v0.1.8)

**接入成功**,四件套齐上:
1. Cargo:`tauri-plugin-system-components = "0.1.8"`(crates.io 直连拉取),`lib.rs` 注册 `.plugin(tauri_plugin_system_components::init())`;host `cargo check` 通过。
2. npm:`@sosweetham/tauri-plugin-system-components-api` + 其依赖 `@tauri-apps/api`。
3. capabilities:`system-components:default` 并入 `default.json`。
4. 前端桥接 `src/lib/nativeTabbar.ts`(新文件):`configureTabBar` 四 tab(概览 house.fill / 过滤器 shield.lefthalf.filled / 日志 doc.text.fill / 设置 gearshape.fill,tint #34d399 对齐设计系统 accent)→ `onTabSelected` → `navigate`;路由变化 → `selectTab` 回写选中态;`getTabBarInsets().bottom + 24px` 注入 CSS 变量 `--tabbar-space`;卸载(登出)时 `removeTabBar`。失败自动回退 CSS 标签栏。

**偏离记录(计划"只改 api.ts"之外的小改,均为玻璃 TabBar 落地的必要改动)**:
- `src/components/Layout.tsx`:`useNativeTabBar()` 就绪时不渲染 CSS `<TabBar>`(原生 bar 接管导航);TopBar 保留。
- `src/index.css`:`.page-shell` 的 `padding-bottom` 由固定 `112px` 改为 `var(--tabbar-space, 112px)`(默认值不变,Web/桌面零影响;原生模式下按真实 Insets 预留)。
- `src/pages/Login.tsx`:debug 构建下 Tauri 分支调用 `get_debug_login`(Rust 读 `AGH_URL/AGH_USERNAME/AGH_PASSWORD/AGH_AUTOCONNECT`,release 恒 null),预填并可自动连接。凭据只经环境变量注入,不写任何日志。
- `src/lib/nativeTabbar.ts`:新增文件(桥接层,约 100 行)。

## 6. iOS 模拟器构建(坑连闯)

三处坑,均已解决:

1. **`--target` 取值**:tauri CLI 要的是短名 `aarch64-sim`,不是完整 rust triple `aarch64-apple-ios-sim`(后者直接报 invalid value)。
2. **Xcode 27 拒绝 deployment target 14.0**(支持区间 15.0–27.0.x)。`tauri ios build` **不会**重跑 xcodegen——pbxproj 只在 init 时生成。修改 `gen/apple/project.yml`(iOS 14.0→15.0)后必须手动 `xcodegen generate` 才落到 pbxproj;Podfile 同步改 15.0(该文件对本工程无实际 pod,仍改掉保持一致)。注意:重新 init 会把 project.yml 刷回 14.0,补丁要在 init 之后打。
3. **Xcode "Build Rust Code" 脚本调不到 CLI**:模板脚本为 `npm run -- tauri ios xcode-script …`,要求 package.json 有 `"tauri": "tauri"` 脚本(官方 create-tauri-app 脚手架自带,本仓库没有)→ 报 `Missing script: "tauri"`。已补进 package.json scripts。

**插件集成机制澄清**(排查时确认):Tauri 2 的 iOS 插件 Swift 代码**不走 CocoaPods**(CLI 构建的 metadata 里 pods 恒为 None,Podfile 始终为空),而是 swift-rs 路线——插件 build.rs 里 `tauri_plugin::Builder…ios_path("ios")` → `tauri_utils::build::link_swift_library` 用 swiftc 把插件 Swift Package 编译成静态库并链进 Rust 静态库,全程在 cargo 构建内完成,Xcode 工程无需感知插件。因此 init 之后才加插件**不需要**重新 init。

## 7. 启动黑屏与路由排障(iOS 27 scene 生命周期)

**现象演进**:装上后启动即崩(主屏截图)→ 修复后黑屏 → 修复后正常出登录页/概览 → 改路由后整树白屏。

1. **iOS 27 SDK 强制 UIScene 生命周期**:无 `UIApplicationSceneManifest` 的 sceneless app 在 `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` 处 EXC_BREAKPOINT 崩溃(tao#1340 证实是 SDK 强制)。tao 0.35.3(被 tauri-runtime-wry 2.11.4 的 `tao ^0.35` 锁死)已带 `TaoSceneDelegate` scene 支持,但 release 构建有 configuration 过早释放 bug(上游 #1245,0.37 未回迁)。**修复**:Info.plist(project.yml 的 info.properties)声明 manifest(`UIApplicationSupportsMultipleScenes: true` + `UISceneDelegateClassName: TaoSceneDelegate`)+ `[patch.crates-io] tao` 指向社区回迁分支 `Argos-Dynamics/tao` 分支 `argos/0.35.3-scene-config-autorelease`(= 0.35.3 + #1245 五行 autorelease 修复)。
2. **`windows: []` 导致黑屏**(接手脚手架里"窗口由 mobile Runner 固定为 main"的注释是错的):scene 模式下窗口由 tauri 按 config `app.windows` 创建,再由 tao `connect_scene` 挂到 scene;数组为空 = 无 WebView。**修复**:config 里显式声明 label=main 的窗口。
3. **tauri.conf.json 的 `app.windows` 与 capabilities 的 `windows: ["main"]` 对齐**,后者本来就写对了。
4. **白屏(React 整树消失)**:根因是 App 层 DebugAutoLogin 的 effect 依赖含 `cfg`,连接成功 → `setCfg` → effect cleanup 置 `cancelled=true` → 自己 `.then` 里的 `nav(route)` 被 `!cancelled` 拦截,导航永远不发生。**修复**:去掉 cancelled 标志(组件常驻,无需取消)。次因:App.tsx 用了 `useNavigate` 却没 import(vite 对未解析标识符只警告不报错,tsconfig 下 tsc 也未拦,`n=useNavigate()` 在运行时 TypeError 打崩整树)——已补 import,并在 index.html 加了**启动错误陷阱**(window error 上屏,壳内无控制台时的定位手段;调试期保留,无错误时零侵入)。
5. **`AGH_ROUTE` 调试导航**:get_debug_login 增加可选 `route`(env `AGH_ROUTE`,以 `/` 开头才生效),自动登录成功后 replace 到该路由,用于自动化截图与路由→原生 tab 双向同步验证;纯调试设施,release 无效。
6. **与并行 SwiftUI 线的 bundle id 冲突(重要遗留风险)**:两线都用 `com.adguardhome.console`,同一模拟器上互相覆盖安装。且对方启动了 iPhone 17 后,`simctl ... booted` 会解析到"最近启动的设备",曾把对方的 app 当成我们的在跑(进程名 AdGuardConsole vs 我们的 AGH Console)。**规避**:本线所有 simctl 命令显式用 iPhone 18 Pro 的 UDID `1243721C-24C7-4DBB-9FDF-CD83D393B706`;后续两线需协调 bundle id 或固定各自设备。
7. **杂项坑**:`tauri ios build` 连续构建会因 `xcarchive` 里残留旧 .app 报 "failed to rename app: Directory not empty"——每次构建前 `rm -rf src-tauri/gen/apple/build`;前端 dist 变更不一定触发 Rust 侧重嵌(tauri-build 未监听 dist),需要时 `touch src-tauri/src/lib.rs` 强制重编。

## 8. 验收结果(Phase 5.5 spike 结论)

模拟器 iPhone 18 Pro(iOS 27.0,UDID `1243721C-…-393B706`),debug 构建(`npx tauri ios build --debug --target aarch64-sim`),mock `http://127.0.0.1:3990`(测试凭据经 `SIMCTL_CHILD_` 环境变量注入,不写入任何文件):

| 验收项 | 结果 |
| --- | --- |
| 登录 mock 成功 | ✓ 环境变量预填 + 自动连接,凭据不落日志 |
| 概览出数据 | ✓ 12.5k 查询/2,170 拦截/23 ms/5 客户端,全部经 Rust `agh_fetch` 从 mock 取得 |
| 4 tab 原生玻璃 TabBar | ✓ 真 UITabBar(SF Symbols + tint #34d399),iOS 27 SDK 构建下为液态玻璃材质,选中胶囊可折射 WebView 内容(概览页绿色图表透过玻璃可见) |
| 路由↔Tab 双向同步 | 路由→选中态 ✓(AGH_ROUTE=/log、/protection 启动,原生 bar 分别选中"日志/过滤器");tap→路由方向代码通路同源(onTabSelected→navigate),未自动化点按验证(见遗留) |
| 日志页加载 | ✓ 查询日志实时列表(mock 数据,类型徽标/状态标签齐全) |
| WebView Insets | ✓ 页面按 getTabBarInsets 预留,内容滚动不被 bar 遮挡 |
| cargo test / clippy | ✓ 11/11 通过、无告警(patch tao 后回归亦绿) |

截图:`.agents/evidence/tauri/01-login.png`(预填登录)、`02-overview.png`(概览+玻璃 bar 折射)、`03-log.png`(日志页,"日志"选中)、`04-tabbar.png`(过滤器页,"过滤器"选中)。

**遗留**:
1. 原生 tab 点击 → JS 路由的方向未做自动化点按验证(无 tap 注入工具;`onTabSelected` 监听已就位,人工走查待用户)。
2. **bundle id 冲突**:与 `ios/` SwiftUI 线同为 `com.adguardhome.console`,同模拟器互相覆盖;两线需协调(bundle id 或固定设备),本线脚本已固定 iPhone 18 Pro UDID。
3. 图标为占位图(深色渐变+白盾,Node 手写 PNG 生成);换正式 1024 源图后重跑 `npx tauri icon` 即可。
4. tao patch 用社区 fork(`Argos-Dynamics/tao@argos/0.35.3-scene-config-autorelease`),上游若发布含 #1245 的 0.35.4/兼容版本应回退。
5. AbortSignal 在 Tauri 分支不生效(SWR 语义可接受);`/filtering/refresh` 120s 长任务已在 Rust 侧支持,未在真机走查。

**结论**:混合壳技术路线成立——现有 React 前端零重构跑在 Tauri iOS 壳内,原生液态玻璃 TabBar 与 CSS 标签栏可在同一代码库按环境降级;达到 RUST_PLAN §4/Phase 5.5 "材质统一、滚动跟手"的初步评估条件,可继续按 Phase 5.5 第 4 步决策(iOS 保持 Tauri 本体)。

## 9. 原生选择器实验(方案 A/B,Windows 侧编码完成,待 macOS 真机验证)

> 2026-09-21。背景:原生玻璃 TabBar 叠在 WebView 之上,Web 版自绘 CSS 底部弹窗会被遮挡,需要给"下拉/弹窗选择"找原生替代。两条路线各接入一个入口,便于真机对照体验。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/lib/nativePickers.ts` | **新增**(约 160 行):两个原生化桥接 + `isTauriShell()` + ReactNode→纯文本工具。全部失败回退 CSS 弹窗,浏览器/桌面零影响 |
| `src/components/ui.tsx` | `usePick` 移动端分支:先试方案 A,失败回退原 CSS 底部弹窗(桌面锚点下拉不变) |
| `src/components/ProtectionCard.tsx` | `openPausePicker`:先试方案 B,失败回退原 `pick()` 路径 |

### 方案 A:WebKit 原生 `<select>`(showPicker)

- **原理**:点击时同步创建临时隐藏 `<select>`(fixed 1px、opacity 0)填入选项,调 `showPicker()`;iOS 弹出系统选择器(输入附件层,层级高于一切,天然不被 TabBar 遮挡)。change → onPick 并移除;cancel/blur 未产生 change → 静默移除。
- **接入点**:`usePick` 全部单选场景(Dashboard 时间范围、日志筛选、设置页选择等)。
- **约束**:showPicker 需 iOS 16+(iOS 27 SDK 满足)且必须处于用户手势同步调用链内(实现上不做 await,保证激活有效);旧 WebKit 无 cancel 事件,用 blur 兜底;选项仅纯文本(ReactNode 递归取 textContent)。

### 方案 B:插件 presentSheet 原生玻璃弹层

- **原理**:`presentSheet({ id, tint, rows })` 弹出系统级 presented 液态玻璃底部弹层(真 detents/抓取条/拖拽关闭),行原生渲染,浮于 TabBar 之上;`onSheetRow` 事件回传 `rowId`(= String(option.value))→ onPick → `dismissSheet`;`onSheetDismissed` 里注销两个监听器。标题用 `kind: 'header'` 行,当前选中项以 `badge: '✓'` 标示。
- **接入点**:防护卡"定时暂停"(独占入口,与方案 A 的 usePick 入口互不干扰)。
- **约束**:插件 0.1.8 文档覆盖约 57%,`sheetRow` 事件回传的真实行为(时机/payload)需真机确认;监听器为全局注册,以 sheetId 过滤,弹层关闭时统一注销。

### macOS 侧验证步骤

1. 同步本分支代码,`npx tauri ios build --debug --target aarch64-sim`(dist 已随构建刷新;若前端变更未生效,`touch src-tauri/src/lib.rs` 强制重编,见 §7 坑 7)。
2. **方案 A**:概览页点"时间范围"→ 应弹**系统原生选择器**(非 CSS 弹窗),选值后图表切换;再验日志页筛选、设置页任一单选。取消/点外部应无残留、无重复 onPick。
3. **方案 B**:防护卡点"定时暂停"→ 应弹**原生玻璃底部弹层**(带抓取条,浮于 TabBar 之上、不被遮挡),标题"暂停防护",当前值带 ✓ 徽标;选"30 秒"→ 防护暂停、倒计时出现;上滑关闭 → 无副作用。
4. **回归**:浏览器(`npm run dev:all`)桌面锚点下拉、移动端 CSS 弹窗、防护卡暂停均应与改动前一致(方案只在 Tauri 壳内生效)。
5. 记录:两个入口的材质观感、跟手度、事件回传是否正常,据此决定 Phase 5.5 下拉原生化是否全面铺开(铺开方向:usePick 的 Tauri 分支二选一,或 A/B 按场景混用)。

### 已知风险

1. `showPicker()` 在 WKWebView 的支持是推断(iOS 16+ Safari 支持;WKWebView 同内核,未经真机确认)——失败会静默回退 CSS 弹窗,不会白屏。
2. `onSheetRow` 的 payload 字段名以 d.ts 为准(`sheetId`/`rowId`),真机若发现行为不符,先抓事件日志再修。
3. 方案 B 的 `dismissSheet` 与用户手动关闭可能竞争,已用 `settled` 标志防重,不会双触发 onPick。

## 9.1 验证结果(macOS 侧,2026-09-22)

> 环境:iPhone 18 Pro 模拟器(iOS 27.0,UDID `1243721C-…-393B706`),debug 构建(前端 dist 23:47 随 `tauri ios build` 刷新),mock `http://127.0.0.1:3990`。点击经 Device Hub 交互屏幕 + CGEvent 合成触摸注入;录像/连拍逐帧核对。截图存 `.agents/evidence/tauri/verify/`。

### 结论速览

| 项 | 结果 |
| --- | --- |
| 构建 & 启动 | ✓ 自动登录 mock,概览/日志/设置各页正常 |
| **方案 B(presentSheet)** | **✓ 全链路可用**——原生液态玻璃弹层(抓取条 + detents)、标题、`onSheetRow` 回传 `rowId` 选值、`dismissSheet` 关闭,浮于 TabBar 之上 |
| **方案 A(showPicker)** | **✗ iOS 27 WebKit 无此 API**——`typeof showPicker !== 'function'`,按设计静默回退 CSS 弹窗,不白屏 |
| 回退机制 | ✓ 两入口回退均正常(CSS 弹窗带遮罩、选值生效、无残留、无重复 onPick) |
| 浏览器回归 | ✓ 桌面锚点下拉(时间范围、暂停防护)与改动前一致 |

### 方案 B(可用,建议铺开方向)

防护卡"定时暂停"实测:

1. 点击 → 系统 presented 玻璃弹层,标题"暂停防护",6 行原生渲染(chevron 行样式),**覆盖在原生 TabBar 之上**(`v3-planB-sheet.png`)。
2. 点"暂停 30 秒" → `onSheetRow` 回传 rowId → onPick → 弹层自动关闭,toast"防护已暂停",倒计时"将于 00:30:52 恢复 · 剩 27 秒"出现(`v4-planB-countdown.png`)。**payload 字段(sheetId/rowId)与 d.ts 一致,时机正常**——§9 风险 2 解除。
3. 上滑 → 中 detent 展开为全屏(真 detents ✓);自抓取条下滑 → 关闭,无副作用、无残留监听(无后续误触发)。
4. 防护暂停期间打开弹层无 ✓ 徽标、恢复后同样无 ✓:查 `ProtectionCard.openPausePicker` 确认**实现未传 `value`**,属"任务书描述与代码不一致"而非缺陷;如需徽标,后续给 openPausePicker 加当前暂停档位的 value 映射即可。
5. 插件 0.1.8 在本机链路实际表现优于文档预期(文档覆盖 57%,本次未踩坑)。

### 方案 A(不可行,弃用)

1. **关键发现:同一模拟器的 Safari(iOS 27.0)里 `sel.showPicker()` 抛 `TypeError: not a function`**——iOS 27 WebKit 未实现(或已移除)该 API,推翻 §9 "iOS 16+ Safari 支持、WKWebView 同内核"的推断。
2. app 内实测:点"时间范围" → `pickViaNativeSelect` 按 `typeof` 检查返回 false → 回退 CSS 弹窗 → 选"6 小时"图表切换、选外部关闭无残留(`v5-css-fallback.png`);设置页"日志保留时长"(带 value 入口)同样回退正常,当前值 ✓ 徽标显示、改"1 天"保存成功(`v6-settings-fallback.png`)。
3. 已知瑕疵(回退路径固有,非本次引入):CSS 弹窗底部仍被原生 TabBar 遮挡(spike 要解的问题本身);`blur` 兜底 250ms 清理在快速连点下可能短暂残留隐藏 select,无可见影响。

### 铺开建议

- **usePick 的 Tauri 分支统一改走方案 B(presentSheet)**:材质与原生 TabBar 统一、真 detents、事件链路已验证;把 `pickViaNativeSheet` 移入 usePick 即可,保留 CSS 回退。
- 方案 A 代码建议保留但不再依赖(`typeof` 守卫使其在旧 iOS(<16?)上仍可能生效),或直接删除以减负。
- `openPausePicker` 如需"当前档位 ✓",补传 `value`。

### 测试方法备注

- Device Hub 窗口(进程名 "Device Hub",Xcode 27 无独立 Simulator.app)会漂移/变焦,全局坐标点击易落空——本次用 CGWindowList 实时取窗口原点 + 窗口相对坐标点击,配合 `simctl io recordVideo` + AVAssetImageGenerator 逐帧核对,未发现"弹层闪现即逝"的证据(方案 A 无 UI 是 API 缺失,非渲染问题)。

## 10. 原生 TabBar 再点当前项回顶部(2026-09-22)

> iOS 惯例手势:再点当前选中 tab → 内容滚回顶部(类似"回根")。前端 `src/lib/scrollToTop.ts` + `nativeTabbar.ts` 桥接实现,CSS 标签栏的同一手势在 dev 分支(Layout.tsx)。

### 结论速览

| 项 | 结果 |
| --- | --- |
| 插件重复点击事件 | ✓ `UITabBarDelegate.tabBar(_:didSelect:)` 对重复选中项同样回调(TabBarOverlay.swift:341 无条件 `onSelect`),`onTabSelected` 原样送达 |
| 概览页深处回点 | ✓ 平滑滚回顶部(`rt1-scrolled.png` → `rt2-backtotop.png`) |
| 过滤器页深处回点 | ✓ 同样回顶(`rt3-protection-retap.png`) |
| 跨 tab 导航 | 不受影响,照旧 navigate |

### 实现

1. `scrollToTop.ts`(dev 分支共享):滚 `document.scrollingElement` 到 0,`behavior: 'smooth'`;已在顶部跳过;`prefers-reduced-motion` 退化瞬时。
2. `nativeTabbar.ts`:`onTabSelected` handler 用 `pathnameRef`(ref,避免监听只注册一次导致闭包 pathname 陈旧)判断 `routeToId(current) === id`:命中则 navigate 回父级路由(子页如 `/protection/filters` → `/protection`,对齐 iOS 回根)+ `scrollToTop()`;未命中照旧 navigate。

### 测试方法备注

- CGEvent 合成触摸复用 §9.1 思路,固化成 `scripts/simtap.swift`(`tap <x> <y>` / `scroll <x> <y> <dy>`,设备逻辑点):
  - Device Hub(Xcode 27,/Applications/Xcode.app/Contents/Applications/DeviceHub.app)窗口需先打开;按窗口名含 "iPhone" 实时取原点防漂移;
  - 屏幕原点/缩放需按截图地标标定(本次:窗口内偏移 (520,74)、scale 0.762,Zoom 或窗口尺寸变化后需重标);
  - 模拟器屏幕 402×874pt;原生 tab bar 四项中心 y≈820,x≈73/156/238/321。
- 构建前清掉了 `gen/apple/build.old.*` 残留(869M,磁盘当时仅剩 4.5G)。

## 11. WKWebView 系统侧滑返回(方案 A-1,2026-09-22)

调研见 `.agents/reviews/2026-09-23-ios-swipe-back-research.md`(wry 0.55.1 有 `with_back_forward_navigation_gestures` 但 tauri 2.11.6 未透出;经 `with_webview` → `PlatformWebview::inner()` 拿 WKWebView 指针运行时开启,objc2-web-kit 类型绑定仅支持 macOS 故用 objc2 `msg_send!`)。分支 `feat/ios-swipe-back`。

### 实现

1. `src-tauri/Cargo.toml`:iOS target 增加 `objc2 = "0.6.4"`(与 wry 传递依赖同版本,不重复编译)。
2. `src-tauri/src/lib.rs`:`setup` 钩子里 `enable_back_forward_gestures`——`get_webview_window("main")` + `with_webview`,`msg_send![wk, setAllowsBackForwardNavigationGestures: true]`。
3. `src/lib/nativeTabbar.ts`:tab 切换/回根全部 `navigate(tab.to, { replace: true })`——tab 导航不进历史栈,侧滑只走业务层级(层级下钻仍 push)。CSS 版 NavLink(浏览器回退)保持 push 属正常网页行为,不动。

### 模拟器验证(iPhone 18 Pro,UDID 1243721C-…,截图 `.agents/evidence/tauri/verify/swipe-*.png`)

| 项 | 结果 |
| --- | --- |
| 子页左缘右滑返回 | ✓ `/protection/filters` → `/protection`,tab 选中态同步正确(swipe-5 → swipe-6) |
| 悬停取消(拖一半停 400ms 松手) | ✓ 回弹留在子页(swipe-7);simtap 新增 `drag` / `dragcancel` 模式 |
| 转场中途快照(录屏逐帧) | ✓ 左侧露出上一页的正确实时快照,子页圆角卡片右移,标准 iOS 交互转场(swipe-frame-hover-snapshot.png)——研究文档标注的最大不确定点(SPA pushState 快照陈旧)实测排除 |
| 构建残留 | 复现 "Directory not empty",`gen/apple/build` 改名挪开后构建通过 |

### 已知行为(记录,非 bug)

- 历史栈底是启动落点 `/`(DebugAutoLogin/Login 均 replace),从 tab 根页继续侧滑会回到 `/`——栈语义使然,观感可接受。
- `AGH_ROUTE` 落点偶发被 Login 自动连接的 `nav('/')` 竞态覆盖(既有问题,与本次改动无关,待后续排查)。
- 同一开关会启用右缘"前滑",与历史栈 forward 条目配合,目前无可前滑场景,无影响。
- simtap 标定随 Device Hub 窗口尺寸/缩放变化需重标(本次:窗口内偏移 (522,82)、scale 0.732)。

## 12. 客户端排序按钮:高度对齐 + 苹果端补原生 select 分支(2026-09-23)

- 触发:用户反馈客户端页排序按钮与同行搜索框不等高,且 iOS 上点开的是自绘下拉。细节与决策见 `.agents/reviews/2026-09-23-desktop-adaptation-snapshot.md` 同名小节。
- 高度:实测 `SearchBar` 43.75px(`py-2.5` + 15px×1.45)vs 按钮写死 `h-[42px]` → 上下各差 0.88px;改 `self-stretch` 跟随行高,复测偏差 0。
- 原生入口:**§9.1 方案 A 的结论在此收尾**——`showPicker()` 在 WebKit 不存在(MDN BCD 亦记 Safari 为 preview + 开关),`isAppleMobile()` 为真时 `pickViaNativeSelect()` 恒返回 false,故任何"只调 usePick"的新入口在 iPhone 上必然退化成自绘下拉(排序按钮即此)。修复:排序入口补上与其他 5 处一致的 `isAppleMobile() ? <PickSelect/> : usePick` 分支;`nativePickers.ts` 只留 `isAppleMobile()`,`pickViaNativeSelect`/冷却期删除(§9.1 铺开建议里的"方案 A 代码建议删除"至此执行)。
- 验证(Windows,playwright + Chrome 390×844,dist/8787 + mock 3990):苹果环境伪造 UA+vendor 后——真实 `select[aria-label="排序方式"]` 5 项、文字透明、`elementFromPoint` 命中该 select、无冗余 button;`name-asc`/`name-desc` 排序列与 `localeCompare('zh-Hans-CN')` 正/逆序一致且**全程未出自绘菜单**。非苹果环境——不渲染 select,点击弹自绘锚定下拉、选中生效后关闭。双端高度偏差 0。


## 13. 侧滑返回空白复现的真相 + 自研边缘侧滑(2026-09-23,fix/ios-back-button)

用户报:"一个页面往下滑到任意地方 → 进子页 → 手势滑回原页,原页空白,然后内容忽然出现",且是"先前修好的问题又复现"。结论:**两个独立原因叠在一起** —— 模拟器上跑的是旧包,而旧包即使修好也治不了 WebKit 的同文档手势。

### 13.1 先纠正前提:模拟器上装的 app 是 04:04 的旧包

- 现象:app 内有个绿色调试 HUD(`no-pop` / `pop#2@748766`),但源码与所有提交里都搜不到;`dist/` 与 `src/` 也搜不到。注入 CSS `body::after{content:"MARKER-7f3a"}` 并重启 app —— **marker 不出现**,说明页面根本不来自仓库源码。
- 定位:WebKit 的 origin 是 `tauri://localhost`(从 `Library/WebKit/.../WebsiteData/Default/<hash>/origin` 读到),而 app bundle 的 `assets/` 目录是**空的** → 前端是 cargo 编译期内嵌进 `libapp.a` 的(带压缩,`strings` 搜不到文案)。比对时间:二进制 mtime 04:04,修复提交 080d3a4 是 04:19 → **旧包必然复现旧行为**。
- 重建流程(必须):`rm -rf src-tauri/gen/apple/build` + `touch src-tauri/src/lib.rs`(tauri-build 不监听 dist)+ `./scripts/ios-signing.sh tauri build --debug --target aarch64-sim`,产物 `build/arm64-sim/AGH Console.app`,`xcrun simctl install`。已写入 PROJECT_MEMORY §7 坑 19。

### 13.2 真正的原因:WKWebView 同文档侧滑的下层是空的

新包(含 080d3a4 的 useEnterSkip 闩)复现,逐帧取证(`simctl io recordVideo` + AVAssetImageGenerator 抽帧 + 内容量 "ink" 指标):

| 时刻 | ink | 画面 |
| --- | --- | --- |
| 拖拽中(t=5.5) | 0.0022 | 子页右移,左侧露出一片**纯 #E3E5EC 空白**,无任何内容(原生返回按钮悬浮其上) |
| 松手后(t=6.4~6.7) | 0.0000 | 整屏纯白(WebKit commit 空白底) |
| t=6.8 | 0.0375 | 内容"忽然"出现 |

- 对空白区采样 #E3E5EC = 略暗于页面底色的均匀色;而真实页面同点是卡片/图标/文字 → **不是滚动错位,是下层没有渲染内容**。
- 结论:同文档(pushState)手势的下层由 WebKit 自己渲染,我们无法写入;松手后才 commit(React 才有机会渲染)→ 空窗无法用动画/闩修掉。**故关闭 `allowsBackForwardNavigationGestures`,侧滑改自研**。

### 13.3 实现(自研边缘侧滑)

- `routeTransition.tsx`:`underlays`(按历史 idx 存"来路页面"HTML 克隆,每次 push 落地时写入;POP/REPLACE 时修剪)+ `useEdgeSwipe`(左缘 24pt 起手、横移 >10pt 接管、斜向/纵向让位滚动;拖拽只写内联 transform,层用 `.rt-page-bg` 不透明;松手按位移 ≥50% 或速度 >0.5pt/ms 提交)。
  - 提交:`consumeGestureCommit` 序号通知转场层与原生按钮,一次把真实路由换上,不播关键帧;下层快照与真实页同像素 + POP 的滚动恢复 → 切换不可见;下层快照在同一布局效应里摘除(否则会从后续页面透明区透出)。
  - 取消:不动历史、不重挂载,transform 收回去。
  - 只对 iOS 壳生效;`useTabJump`(replace)落地条目无快照 → 不接管(不误跨 tab 返回)。
- `nativeBackButton.ts` + 插件:`appearOffsetX`(前进 +100vw / 返回 -28vw / 0.34s / 同 rt-* 曲线)让原生按钮**跟着导航条一起滑入**,不再等转场结束再创建 —— 这是"CSS 胶囊先到、原生按钮后到"二次出现的根因;侧滑期间按钮整体让位给 CSS 胶囊。
- `lib.rs`:手势开关置 false。

### 13.4 验收(新包,iPhone 18 Pro / iOS 27)

| 项 | 结果 |
| --- | --- |
| 滚动后进子页 → 侧滑返回 | ✓ 拖拽全程有真实内容(t=4.8→5.1 ink 0.0077→0.0356 单调上升,无空白帧);抽帧可见下层是原页(自定义过滤规则/拦截服务/… 实拍) |
| 落地滚动位置 | ✓ 与进子页前逐点一致(diff 0.001) |
| 取消(拖 25% 松手) | ✓ 回弹留在子页,无重挂载(diff 0.204) |
| 提交(拖 300pt) | ✓ 返回原页(diff 12.3 与子页相比) |
| 边缘区纵向拖动 | ✓ 正常滚动(diff 15.7,与中间起手 14.3 同量级) |
| 返回按钮点击 | ✓ 返回并恢复滚动(diff vs 进子页前 0.057) |
| 按钮交接 | ✓ 前进转场抽帧:只有一个按钮、与页面左缘同步位移(子页左缘 42pt 时按钮左 54pt ≈ 16+42) |
| 无残留下层 | ✓ 侧滑返回后再进同一子页,画面与基线一致(0.263 = 环境光晕 1/255 级差异),空隙处采样均为 #EEF1F7 |
| `cargo test` | ✓ 11/11(mock 3990 在跑) |
| `npx tsc --noEmit` / `npm run build` | ✓ |

### 13.5 测试工具备注(下次省事)

- **合成事件要先激活 Device Hub 窗口**(`NSRunningApplication.activate`),否则点击落到 ZCode 窗口上、全部无效;`CGWindowListCopyWindowInfo` 的窗口名与 Screen Recording 权限无关地为 nil,按 owner=Device Hub + 最大 onscreen 窗口取。
- 标定:窗口 1100×800 → 屏幕原点窗口内偏移 (522,82)、缩放 0.732(device pt → 窗口 px);`simctl io screenshot` 是 **1206×2622 px = 3.0 px/pt**(用 2.24 去量会把尺寸算大 34%,本次踩过 —— 44pt 按钮量成 60pt,导致多次点空)。
- 左缘手势起手点要 ≥5pt 进屏(3pt 偶发落在 bezel 上不触发)。
- 组件(`/tmp/agtap|ggest|gswipe|vframes|analyze|idiff|crop|sample`)是本机临时工具,未入库。

### 13.6 用户实测返工三连(2026-09-23 晚)

1. **"返回后旧页面闪一下新页面"**:提交路径在 `nav(-1)` 之前 `teardown` 清了子页容器的 transform,React 路由提交是异步的(startTransition),中间几帧子页整屏弹回 translate 0 盖住下层快照。修复:提交时不动任何 transform,收尾统一放到真实路由提交后的布局效应(绘制前)。
2. **"侧滑过程中安全搜索的开关被换行了"**:真正根因不在布局,在快照的**序列化方式** —— 快照走 `innerHTML` 字符串再经 `dangerouslySetInnerHTML` 解析,而安全搜索行因可点击被渲染成 `<button>`,行内开关也是 `<button>`;HTML 解析器不允许 button 嵌套 button,解析后里层开关被拆成兄弟节点掉到行下左侧(前两行是 div 所以没事;用户原话"上两个开关没溢出,第三个溢出了")。修复:快照改 `cloneNode` 直挂真实 DOM 节点(转场层/下层快照渲染空壳 div + ref `replaceChildren`),`attachNode` 幂等。这也顺带修好了 CSS push/pop 退场层的同类隐患。
3. **下层视差归零**:原 -28% 视差让拖拽中的下层内容比返回后整体偏左(最多 113pt),用户按住审视中间态时"跟返回前后都不一样"。改 0(下层停终位,只有上层滑走,与 UIKit 交互式返回一致)。
4. 验收(逐帧,scroll≈480 → DNS 重写):整段拖拽三行开关全部在行内、位置与返回后逐像素一致;提交瞬间逐帧 diff vs 落地页平滑收敛(2.17→0.003,无尖峰=无闪帧)。

## 14. 客户端页返回按钮与侧滑修复(2026-09-24,fix/clients-back-nav)

用户报:概览统计卡进 `/clients` 后无原生返回按钮、侧滑不接管。两个独立原因叠加:`/clients` 在 `TOP_LEVEL_ROUTES`(为桌面侧边栏设计的分类)里被 `nativeBackButton` 按顶级路由移除按钮;入口走 `useTabJump`(replace)不进历史栈,自研侧滑只对 PUSH 落地(有来路快照)的条目接管。提案见 `.agents/pipelines/proposals/bug-fix/2026-09-24-clients-back-nav.md`。

- 改法:`src/lib/routes.ts` 拆出 `TAB_ROOT_ROUTES`(移动端 4 个 tab 根)与 `TOP_LEVEL_ROUTES`(收窄为桌面侧边栏根);返回按钮显隐、TopBar 状态条、转场方向仲裁三处消费方改用前者;概览统计卡入口改 `nav('/clients')` push。push 落地后侧滑快照/滚动恢复/深链回退均由现有机制自动生效,Rust 侧零改动。
- 坑再确认:重建前必须 `rm -rf src-tauri/gen/apple/build` + `touch src-tauri/src/lib.rs`,否则模拟器跑旧包误判(§13.1 同款,本次主动执行)。
- 验收:用户模拟器验证通过(push 转场 + 原生按钮 + 侧滑返回、tab 互切不可侧滑跨 tab 回归正常);`npm run check` / `npm run build` 绿。

### 14.1 后续:移动端不得以 replace 进入父级列表页(2026-09-24 同日)

用户复测追加「移动端不能把客户端当成 replace 处理,否则在浏览器没法返回上一页」。残余路径:`ClientFormPage` 保存后 `nav('/clients', { replace: true })` —— 从列表 push 进表单再保存,栈里留下两条 `/clients`,浏览器/系统返回按一次等于没动;另有 `ClientDetailPage` 删除后裸 `nav(-1)`,直落该页时空操作。

- 改法:把「有历史条目就 POP(带 backNav 标记)、栈空才 replace 回父级」抽成 `src/lib/backNav.ts` 的 `navBack(nav, pathname)`,返回胶囊(`ui.tsx`)、原生按钮(`nativeBackButton.ts`)、表单保存/取消、详情删除收尾共用一个实现,三处重复的内联逻辑一并消除。
- 边界:桌面端添加/编辑与详情走居中弹层(`Clients.openForm`/`openDetail` 的 isDesktop 分支),不经过这两个页面路由,行为不变;`ClientFormPage`/`ClientDetailPage` 的深链场景由 `navBack` 的栈空分支兜底。
- 验收:`npm run check` / `npm run build` 绿;模拟器包已重建安装(iPhone 18 Pro),等用户复测保存返回与浏览器返回。

## 15. 客户端页可左右拖动:原生 select 的 option 撑宽文档(2026-09-24)

用户报「客户端页内容可以左右滑动,貌似页面宽度溢出了」。Chromium 里量不到(含长数据桩、402/390 两档宽度均无溢出),换 **playwright WebKit + iPhone UA** 复现:文档 `scrollWidth` 433 > 视口 402,但**没有任何元素 rect 越界**——常规 `getBoundingClientRect` 排查是失效的。

- 定位手法:逐个元素 `display:none` 后看 `document.scrollingElement.scrollWidth` 是否回落。元凶是客户端页排序控件的原生 `<select>` 覆盖层(`PickSelect`,苹果分支):WebKit 把 `<option>` 当真实盒子按文字宽度布局,「请求数从多到少」比 56pt 的控件宽出 31px,且不被裁剪 → 溢出冒泡到文档。概览/防护/设置页的 PickSelect 也同源,只是那些控件较宽、选项未越界,所以只有客户端页暴露。
- 修法:`PickSelect` 的 `<select>` 加 `overflow-hidden`(组件单点);实测 `select{overflow:hidden}` 与「外层 span 裁剪」都能把文档宽度收回 402,只给 `option` 加 ellipsis 无效。
- 验收:WebKit 实测 `/clients` 402/402;13 条移动端路由全部 over=0;控件尺寸与位置逐点不变;`.field` 可见选择器即使塞超长 option 也不撑宽(无需改)。`npm run check`/`npm run build` 绿;模拟器包已重建安装。
- 待用户复测:排序钮点击仍能唤出系统选择器(`overflow-hidden` 不改可点性,但只有模拟器能验证原生 picker)。平台事实记入 `docs/engineering.md`,提案 `.agents/pipelines/proposals/bug-fix/2026-09-24-native-select-doc-overflow.md`。
