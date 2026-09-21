# Rust 跨平台开发计划 — Windows / macOS / Android / iOS(供后续会话施工)

> 创建:2026-09-21。配套必读:`PROJECT_MEMORY.md`(项目概况/坑/用户偏好)、`PC_ADAPTATION.md`(桌面适配)、`README.md`(功能总览)。
> 本文档是施工蓝图:先读"现状与结论",再按 Phase 顺序施工。**每个 Phase 有明确验收标准,完成后在本文档勾选并记录偏差。**

---

## 0. 项目现状(已核实,勿重新探查)

- **应用**:AdGuard Home Console——AdGuard Home v0.107.79 的管理控制台。前端 React 19 + Vite 8 + Tailwind 4 + SWR(`src/`),后端是一个 164 行的 Express 代理(`server/index.mjs`):
  1. 托管 `dist/` 静态产物 + SPA 回退;
  2. 反向代理 `/api/agh/*` → 目标 AGH `/control/*`(AGH 不返回 CORS 头,浏览器无法直连),凭 Basic Auth + `X-AGH-Target` 头透传,手动跟随 301/302/307/308 最多 3 次,超时 25s(`/filtering/refresh` 单独放宽 120s),超时/网络错误统一返回 502 + `{error: msg}`。
- 前端所有 API 调用集中在 `src/lib/api.ts` 的 `api()` 函数,走相对路径 `/api/agh/*`;凭据存 localStorage(`agh.console.cfg.v1`)。**改 Rust 层时前端理论上只需动 `api.ts` 一个文件。**
- `src/lib/auth.tsx` 负责 SvrConfig(url/username/password)、登录探测(`GET /status`)、主题;登录判定依赖 `s.version` 存在。
- `_probe/` 有 v0.107.79 官方 OpenAPI 规范(`openapi.yaml`/`openapi.json`)与 20+ 个端点的**真实响应样本**,可直接作为 Rust 层测试夹具。
- API 关键事实(单位全是 **毫秒**、reason 是字符串枚举、stats 的 top_* 是单键对象数组等)详见 `PROJECT_MEMORY.md` 第 3 节。
- 本机工具链(Windows):rustc/cargo 1.88.0 已装 ✓;Node 24 ✓。

## 1. 目标与结论

**目标**:把现有 Web 控制台打包为原生应用,支持 **Windows / Android / iOS / macOS**。Rust 承担原 proxyAGH 的代理逻辑(以及未来的本地能力)。
**分工变更(2026-09-21,用户决策)**:iOS 改走**纯 SwiftUI 原生 App**(真 iOS 26 液态玻璃,URLSession 直连无 CORS、无需 Rust 代理),见 `IOS_NATIVE_PLAN.md`;**本计划(Tauri)只覆盖 Windows / Android / macOS**。

**技术选型(已定,施工勿再摇摆)**:**Tauri 2.x**。理由:
- 一套 Rust 核心 + WebView 壳,四平台全覆盖;前端 `dist/` 原样作为 `frontendDist`,UI 零重写。
- Tauri 2 的移动端(iOS/Android)已稳定;WebView 引擎(WKWebView / Android WebView / WebView2)与现有 Web 实现兼容,Liquid Glass 的 backdrop-filter/安全区/WAAPI 动效均可运行。
- 备选方案已否决:纯 Rust 核心 + 各端原生壳(工作量指数级)、Electron(不支持移动)、Capacitor(Rust 无处安放)。

**Rust 层设计**:
- 不用 `@tauri-apps/plugin-http` 直通(超时分级、重定向策略、错误语义都得散落回 JS),而是写**一个 Rust 命令 `agh_fetch`**,在 Rust 里完整复刻 `server/index.mjs` 的 `proxyAGH` 行为(重定向×3、25s/120s 双档超时、502 错误语义),前端经 `invoke` 调用。
- Web/浏览器模式(Express 8787)**保留**,`api.ts` 做运行时分支:`window.__TAURI_INTERNALS__` 存在 → invoke;否则 → 原相对路径 fetch。浏览器访问模式不回退。

## 2. 硬约束与风险(施工前必须知晓)

| # | 事项 | 说明 |
| --- | --- | --- |
| R1 | **macOS 构建需 Mac** | Windows 无法交叉产出 .app(Xcode 工具链私有)。本机是 Windows → macOS 走 CI(GitHub Actions `macos-latest` runner)或借用 Mac;先做 Windows + Android。iOS 同理且已移交原生线(`IOS_NATIVE_PLAN.md`)。 |
| R2 | **明文 HTTP** | AGH 实例常为 `http://`(目标实例 `http://<AGH_HOST>:3990`,Tailscale CGNAT 段)。Android 需 `usesCleartextTraffic`/network_security_config;iOS 侧见 IOS_NATIVE_PLAN(ATS 例外 + NSLocalNetworkUsageDescription)。 |
| R3 | iOS 签名 | 真机调试可用免费 Apple ID(7 天有效期);分发需 $99/年开发者账号。是否购买**需用户决定**。 |
| R4 | 移动端后台节流 | App 切后台后 webview 定时器被暂停,SWR 轮询(2s 日志/5s stats)会停;回前台应立即刷新。验证时注意,勿误判为 bug。 |
| R5 | 性能红线(用户已定稿) | 大面积 backdrop-filter 会让 iOS 发烫——现有代码已把卡片全改实色,**勿回退**;动效幅度勿加大(见 PROJECT_MEMORY §4/§8)。 |
| R6 | 凭据 | 密码经 invoke 传参时,Rust 侧**禁止打日志**;localStorage 先沿用(P2 再评估 Keychain/Keystore 升级)。 |
| R7 | `/filtering/refresh` | 全量拉 19 万条规则,移动网络下可能超 120s,UI 已有 toast 汇报,勿删长超时分支。 |
| R8 | 通用属性坑 | 主题挂在 `data-theme` 上,曾遭浏览器扩展改写(PROJECT_MEMORY §7/PC_ADAPTATION"主题刷新后变浅色");WebView 环境无扩展,风险低,但新代码勿再挂通用命名属性。 |

## 3. 目录规划

```
src-tauri/                  ← 新增(唯一 Rust 侧)
  Cargo.toml                # tauri 2 + tokio + reqwest(json, 非默认-tls 按需)+ thiserror
  tauri.conf.json           # frontendDist: "../dist", devUrl: "http://localhost:5173"
  capabilities/             # Tauri 2 权限清单(默认最小化)
  src/
    lib.rs                  # 入口、命令注册
    proxy.rs                # agh_fetch 核心:URL 拼接/重定向/超时/错误语义
  icons/                    # 四平台图标(tauri icon 生成)
  gen/android | gen/apple   # tauri android|ios init 生成物(提交与否见 Phase 4)
server/  src/  dist/        ← 现状不动(Web 模式继续可用)
```

Rust 代码规范:错误统一 `ProxyError → {status, error: msg}` 结构返回给 JS,对齐现有 `ApiError(status, message)`;async 用 tokio;除 `agh_fetch` 外暂不加命令,克制。

## 4. 施工计划(Phase 0 → 7)

### Phase 0:脚手架 — [ ]
1. `npm i -D @tauri-apps/cli`;`npx tauri init`(app 名、identifier 待用户确认,暂用 `com.adguardhome.console`)。
2. `tauri.conf.json`:`frontendDist: "../dist"`、`devUrl: "http://localhost:5173"`、`beforeDevCommand: "npm run dev"`、`beforeBuildCommand: "npm run build"`。
3. 验收:`npx tauri dev` 在 Windows 打开窗口,登录目标实例(`http://<AGH_HOST>:3990`),仪表盘出数据——此时还走不到 AGH,应报 CORS/404 类错误,属预期;能构建 `npx tauri build` 出 NSIS 安装包即算过。

### Phase 1:Rust 代理核心 — [ ]
1. `src-tauri/src/proxy.rs` 实现 `agh_fetch(method, target, auth_header, path_with_query, body_json) -> {status, content_type, body_text} | {status:502, error}`:
   - 路径重写 `/api/agh` → `/control`(由 JS 传已重写好的 path,或 Rust 内重写,二选一,保持简单);
   - 手动跟随 301/302/307/308 最多 3 次(注意 308 的 origin 替换语义,照抄 Express 版 `new URL(location, upstream).origin` 整个换 origin 的行为);
   - 超时:含 `/filtering/refresh` 的请求 120s,其余 25s;超时 → `502 {"error":"连接超时,请检查地址与网络"}`;
   - 非 GET 透传 JSON body;响应原样回传 text + content-type(**不要在 Rust 解析/重排 JSON**,前端已有 KVMap 归一等逻辑)。
2. 测试:`cargo test` 用 `wiremock`(或 `httpmock`)覆盖:正常转发、Basic Auth 头透传、308 跟随、25s/120s 超时分支、非 JSON 响应、缺 target 400。样本对照 `_probe/`。
3. 验收:`cargo test` 全绿;`cargo clippy` 无 error。

### Phase 2:前端运行时适配 — [ ]
1. `src/lib/api.ts` 单点改造:`isTauri()`(探测 `window.__TAURI_INTERNALS__`)→ `invoke('agh_fetch', {...})`,把结果映射为与现有 `fetch` 路径完全相同的返回/异常(`!ok → ApiError(status, data?.error || ...)`)。`qs()`、类型定义、`swrFetcher` 全部不动。
2. `src/lib/auth.tsx` 不动(localStorage 逻辑在 WebView 内照常工作)。
3. 验收(双模式回归):
   - **浏览器模式**:`npm run dev:all`,Chrome 390×844 与 1440×900 走查 概览/日志/防护/客户端/设置 + `/stats`,零回归(对照 PC_ADAPTATION 截图清单);
   - **Tauri 模式**:`npx tauri dev`,同上走查 + 登录/登出/多实例切换 + 从日志一键拦截域名(写操作)+ `/filtering/refresh` 长任务。

### Phase 3:打包打磨(Windows) — [ ]
1. `npx tauri icon`(提供一张 1024 源图,需用户出图或先用占位);窗口标题/最小尺寸(桌面已有 ≥1024 侧栏布局,建议 min 960×640)。
2. `npx tauri build` 产出 NSIS/MSI;验证安装后 WebView2 运行时行为(Win10/11)。
3. 验收:安装包在干净 Windows 上可装可跑;深浅色主题跟随系统。

### Phase 4:Android — [ ]
1. 环境装配:Android Studio + SDK + NDK;`rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`;`npx tauri android init`。
2. 明文 HTTP(R2):`android:usesCleartextTraffic="true"` 或更精细的 network_security_config(允许私有网段 + 100.64.0.0/10)。
3. `npx tauri android dev`(真机 USB/Tailscale)全功能走查(同 Phase 2 清单);重点:2s 实时日志的滚动性能与发热、切后台回前台的刷新(R4)。
4. `npx tauri android build --apk`(debug 自签名先行;release 签名 keystore 由用户提供/生成,密码勿入库)。
5. 验收:真机安装 APK,局域网 http 实例与 Tailscale 实例均可登录使用;`gen/` 生成物入 .gitignore 与否做决定并记录。

### Phase 5:macOS(R1,需 Mac 或 CI;iOS 已移交 IOS_NATIVE_PLAN.md) — [ ]
1. 方案 A(推荐):GitHub Actions `macos-latest`:`rustup target add aarch64-apple-darwin x86_64-apple-darwin` + `tauri-action`/手写 workflow,产出 .dmg(通用二进制)。
2. macOS 默认无沙盒,局域网/Tailscale 明文 http 可直连,无 Android/iOS 的权限配置负担。
3. 有条件时:开发者签名 + 公证(避免 Gatekeeper 拦截);无证书则用户右键打开绕行。
4. 验收:CI 绿,.dmg 在 Intel/Apple Silicon 各一台(或至少 ARM)上可跑,局域网实例登录使用正常。

### Phase 5.5(可选,与 IOS_NATIVE_PLAN 二选一):iOS 走 Tauri + 社区原生组件插件 — [ ]
> 2026-09-21 生态核查:社区已出现对口插件,混合壳的"胶水"部分不再需要从零自研,该路线重新可行。仍是 0.x 早期项目,必须先 spike 评估再定夺。
1. **tauri-plugin-system-components**(sosweetham,v0.1.8,2026-08,MIT):iOS 原生 UITabBar 叠在 WebView 上(用 Xcode 26/iOS 26 SDK 构建时自动获得真液态玻璃、折射 Web 内容),自带滚动几何同步;另有原生液态玻璃底部弹层、浮动按钮;macOS 26 可得 NSGlassEffectView 玻璃窗口背景(旧系统降级 blur)。文档覆盖约 57%。
2. 备选 **tauri-plugin-ios-glass-tabbar**(tuanle96,v0.1.0,2026-08):iOS 玻璃 tab bar(TabItem/SF Symbols/badge/显隐 + tabSelected 事件),更新但更早期(文档 14%)。
3. Spike 步骤:接入 system-components → 4 tab(概览/过滤器/日志/设置)对齐现有信息架构 → WebView 预留 TabBarInsets → JS 侧路由与 tabSelected 双向同步 → 真机(iOS 26)评估**真玻璃 bar 与 CSS 模拟玻璃卡片的材质统一度**。
4. 决策规则:材质统一、滚动跟手、稳定 → iOS 保持 Tauri 本体(本计划覆盖四平台,IOS_NATIVE_PLAN 搁置);不达标 → 回退纯 SwiftUI 原生线。
5. 约束:仍需 Mac + Xcode 26(R1 不变);Android 无对口插件,Android 永远用 Web 版 tab bar(可接受,Material 环境下无违和)。

### Phase 6(可选,P2):增强项(逐项单独确认后再做) — [ ]
- 凭据升级:Android Keystore / iOS Keychain(tauri 插件或 `keyring` crate),localStorage 迁移;
- Rust 复刻完整 Express(单二进制 Web 服务器模式,替代 `server/index.mjs`,含 HOSTS 网卡监听自愈);
- 自动更新(tauri-plugin-updater,Windows/macOS);
- 系统托盘/全局快捷键(桌面)、图标角标(通知数)等本地能力。

## 5. 施工"不要做"清单

1. **不动** `src/` 下除 `api.ts` 以外的任何文件(Phase 2 只此一个文件有 diff;若确需更多,先在本文档记录理由)。
2. 不动 `server/`(Web 模式保留原样);唯一例外历史:PC 适配期曾为 `/filtering/refresh` 放宽过超时,勿重复。
3. 不重构 UI、不动设计系统、不加大动效幅度、不加宣传文案(用户偏好,PROJECT_MEMORY §10)。
4. Rust 侧不解析/不改写 AGH 响应体;不新增 Tauri 插件除非本计划列出。
5. 密码/Authorization 头不得写入任何日志、错误信息、panic 消息。
6. 单位字段(一切 duration/interval)先查 `_probe/openapi.yaml` 再写,AGH 全用毫秒(坑过两次)。

## 6. 待用户决策(不阻塞 Phase 0–4)

1. App identifier 与显示名(默认 `com.adguardhome.console` / "AdGuard Home Console");
2. 是否购买 Apple 开发者账号(R3,一份决策同时管 Tauri-macOS 线与 iOS 原生线);
3. 1024×1024 应用图标源图(两条线共用);
4. Android release 签名 keystore 的持有方式;
5. Phase 6 增强项的取舍与优先级。

## 7. 进度记录(施工 agent 追加)

| 日期 | Phase | 结果/偏差 |
| --- | --- | --- |
| 2026-09-21 | — | 计划创建(评估完成,未动工) |
