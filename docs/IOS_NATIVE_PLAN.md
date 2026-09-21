# iOS 原生版方案 — SwiftUI + iOS 26 Liquid Glass(供后续会话施工)

> 创建:2026-09-21。配套必读:`PROJECT_MEMORY.md`(API 差异表 §3、用户偏好 §10)、`RUST_PLAN.md`(Tauri 线:Windows/Android/macOS)、`README.md`(功能总览=需求规格)。
> **背景与决策**:用户要求 iOS 移动端采用原生 UI 组件(例:iOS 26 液态玻璃 tab bar)。经评估,iOS 走**纯 SwiftUI 原生 App**,与 Tauri 线并行;iOS 不再使用 Tauri 壳。

---

## 1. 方案对比(为什么选纯原生)

| 方案 | 说明 | 结论 |
| --- | --- | --- |
| A. Tauri 壳(原计划) | WebView 渲染现有 React 页 | ❌ 液态玻璃是 CSS 模拟,拿不到系统真材质(折射、形变、与系统动效联动);正是用户不满意的点 |
| B. 混合壳:SwiftUI 原生 chrome + WKWebView 内容 | 原生 TabView/导航栏,内容页仍是 React | ❌ 不推荐:WKWebView 滚动与原生导航栏折叠联动是著名的坑,状态双份(SWR vs Swift),"半原生"体验割裂,维护两套心智 |
| **C. 纯 SwiftUI 原生 App(当前选定)** | 全部 UI 用 SwiftUI 重写,URLSession 直连 AGH | ✅ 原生 TabView 免费获得真液态玻璃(现 Web 版透镜动效本就是在模仿它);Swift Charts 替代自绘 SVG;原生 Sheet/ContextMenu/Toggle/Picker/搜索/触觉反馈 |

> **2026-09-21 补充**:社区已出现 Tauri 混合壳插件(`tauri-plugin-system-components` v0.1.8:iOS 原生 UITabBar + 液态玻璃弹层;`tauri-plugin-ios-glass-tabbar` v0.1.0),方案 B 的"胶水从零自研"问题部分被解决,详见 `RUST_PLAN.md` Phase 5.5。但材质不统一(真玻璃 bar 叠 CSS 模拟卡片)与 0.x 成熟度风险仍在,故本线(纯原生)保持默认,待 Phase 5.5 spike 结论出来后再最终二选一。

**关键技术事实:CORS 代理在 iOS 上不需要。** `/api/agh` 代理(Rust/Express)存在的唯一原因是浏览器跨域限制;原生 App 的 URLSession 直接请求 `http://<AGH>/control/*` 即可,Basic Auth 放请求头。因此 **iOS 版可以完全不依赖 Rust**;Rust 线(Tauri)只服务 Windows/Android/macOS。

## 2. 架构

```
iOS App(SwiftUI, 最低部署目标 iOS 26)
├── Network/  APIClient:URLSession async/await 直连 AGH /control/*,Basic Auth
├── Models/   Codable 结构,逐字段对照 src/lib/api.ts 的 TS 类型
├── State/    @Observable 会话(SvrConfig 多实例)+ 各页轮询引擎(Task + Task.sleep)
├── Features/ Overview / Filters / QueryLog / Clients / Settings(对应 Web 版页面)
└── Resources/ Info.plist(ATS 例外 + 本地网络权限)
凭据:iOS Keychain(keychain-access-groups,勿用 UserDefaults)
```

- API 契约与坑完全复用 `PROJECT_MEMORY.md` §3:一切 duration/interval 单位是**毫秒**;reason 是字符串枚举(FilteredBlackList/.../RewriteRule 12 个);stats 的 `top_*` 是单键对象数组(需归一成 [k,v]);protection 用 `POST /control/protection {enabled, duration(ms)}`;querylog 支持 search/reason[]/older_than/offset/limit;`_probe/` 有全部端点真实响应样本,作为 Codable 解码测试夹具。
- 轮询策略与 Web 版一致:stats 5s / clients 60s / filtering 20s / 实时日志 2s;**App 进后台取消 Task、回前台立即刷新一次**(scenePhase 驱动)。
- 明文 HTTP:Info.plist 加 `NSAppTransportSecurity → NSAllowsArbitraryLoads`(实例多为 `http://`,含 Tailscale 100.64/10 段)或按需收敛;`NSLocalNetworkUsageDescription` 必填(iOS 14+ 访问局域网弹权限)。

## 3. UI 映射表(Web → SwiftUI 原生)

| Web 版(现有) | iOS 原生 |
| --- | --- |
| 4 tab 标签栏(CSS 透镜动效) | `TabView` 4 tab:概览/过滤器/日志/设置(信息架构与现版一致:无客户端 tab,客户端入口=概览"客户端"方块);真液态玻璃 + `tabBarMinimizeBehavior(.onScrollDown)` 下滑收起 |
| 顶栏 TopBar | `NavigationStack` 大标题 + toolbar |
| 防护总开关+定时暂停 30s~3h | 原生 Toggle + 时间选择(Menu/Picker,毫秒换算) |
| 自绘 SVG 趋势图 | **Swift Charts**(24h 面积图、每小时触摸查看用 chartOverlay/规则) |
| 环形图/排行表(StatsPage) | Swift Charts SectorMark / 原生列表 |
| 日志详情浮层 | 原生 Sheet(+presentationDetents) |
| 长按操作(Web 版全局禁用长按,用显式按钮) | **恢复原生长按**:`contextMenu`(原生体验,Web 版禁用长按是 Safari 的妥协,iOS 原生无此问题) |
| Row+Switch、下拉选择 MenuHost | List + Toggle、Picker(菜单样式) |
| 底部弹窗选择器 | Sheet / 原生 menu |
| 搜索框(域名/客户端) | `.searchable` |
| 下拉刷新(现无,靠轮询) | `.refreshable` 新增 |
| 深浅色主题手动切换 | 跟随系统 + App 内覆盖(原生 preferredColorScheme) |
| 触觉反馈(现无) | UIImpactFeedbackGenerator/sensoryFeedback(用户口味克制,轻量使用) |

液态玻璃细节:iOS 26 SDK 的 `glassEffect()`、`GlassEffectContainer`、`buttonStyle(.glass)`、`backgroundExtensionEffect()`、`ToolbarSpacer` 等 API **施工时以 Xcode 26 官方文档为准核实签名**(本文档写作时按 WWDC25 公开资料,若有 iOS 27 变化以新 SDK 为准)。设计基调仍守用户偏好:克制、勿夸张、无宣传文案。

## 4. 施工阶段(每个 Phase 验收后再进下一个)

- **Phase N0 脚手架** — [ ] Xcode 26 工程(SwiftUI lifecycle,最低 iOS 26,Swift 6 并发检查开启);目录结构按 §2;`.gitignore` 补 Xcode/DerivedData 条目;真机可空跑。
- **Phase N1 网络与模型** — [ ] APIClient(直连 `/control/*`,Basic Auth,手动跟随无必要——原生无 308 换源问题但保留 followRedirects 默认);Codable 模型覆盖 api.ts 全部类型;`_probe/*.json` 做 XCTest 解码夹具(重点:KVMap 双形态、ms 单位字段、reason 枚举);错误类型对齐 Web 版 ApiError 语义(401/403→"用户名或密码错误")。验收:解码测试全绿。
- **Phase N2 会话与登录** — [ ] Keychain 存多实例 SvrConfig;登录页(地址/账号/密码,GET /status 探测,`s.version` 判定);主题跟随系统。验收:真机登录目标实例(`http://<AGH_HOST>:3990`)。
- **Phase N3 概览 tab** — [ ] TabView 骨架(4 tab 真液态玻璃)+ 防护卡(开关/定时暂停/到期倒计时——注意 PROJECT_MEMORY §7 坑 5:倒计时锁快照,勿随轮询重置)+ 统计块 + Swift Charts 24h 趋势(6/12/24h 切换)+ Top 榜单 + 上游延迟。轮询 5s/60s,后台暂停。
- **Phase N4 过滤器 tab** — [ ] 过滤器列表(启停/增删/手动更新/更新间隔)、自定义规则编辑、139 拦截服务网格(搜索 + SVG 图标:base64 icon_svg 可直接渲染或转 UIImage)、规则检测(check_host)、浏览安全/家长控制/安全搜索(7 引擎)、DNS 重写管理。`/filtering/refresh` 长任务用进度指示,勿设短超时。
- **Phase N5 日志 tab** — [ ] 实时 2s 滚动合并(对齐 Web 版去重合并逻辑)、LOG_FILTERS 同款筛选、`.searchable`、无限回溯(older_than)、详情 Sheet(解析/TTL/规则/ECS/上游)、**contextMenu 长按 + 显式按钮双通道**一键拦截/白名单(`POST /filtering/set_rules`)。验收:真机滚动流畅、切后台回前台不漏数据。
- **Phase N6 客户端** — [ ] 持久客户端 CRUD(POST clients/add/update/delete,注意 update 结构 `{name, data}`)、每客户端策略、自动识别客户端一键转持久。
- **Phase N7 设置** — [ ] 日志/统计配置(保留时长+匿名化)、DNS 全套(上游/Bootstrap/Fallback/多上游模式/缓存/DNSSEC/EDNS/拦截模式/限速)、上游测试、访问控制、加密(证书详情)、DHCP(接口/V4/静态租约/冲突检测)、版本检查/清缓存/重置统计。
- **Phase N8 打磨** — [ ] 液态玻璃细节(glassEffect 用在浮动元素,勿大面积——性能红线同 Web 版)、触觉反馈、App 图标、亮暗色全走查、空态/错误态。
- **Phase N9 发布** — [ ] ATS/本地网络权限文案定稿;TestFlight 分发(需 Apple 开发者账号 $99/年,与 RUST_PLAN R3 同一决策);真机全功能走查(局域网 http 实例 + Tailscale 实例)。

## 5. 约束与不要做

1. **必须有 Mac + Xcode 26**(R1 硬约束不变);无 Mac 则本线阻塞,CI 无法做真机调试与签名。
2. 最低部署目标 iOS 26:液态玻璃 API 是系统级,iOS 17/18 降级材质方案**暂不做**(待用户决定是否要兼容旧系统)。
3. Rust 不引入 iOS 线:若未来想共享核心逻辑,再评估把 `crates/agh-core`(API 类型/枚举/单位换算)用 UniFFI 出 Swift 绑定,**第一版不做**——Swift 直连更简单,双实现以 `_probe/` fixture 测试保证契约一致。
4. 视觉对齐系统原生(iOS 26 系统自带样式优先),不要把 Web 版的 CSS 参数(透明度/圆角比例)硬搬进 SwiftUI——先用系统默认,再按用户反馈微调。
5. 用户偏好照旧:中文文案、无宣传语、克制动效、先拿真实数据复现再动手。
6. App Store 审核:管理工具类一般无碍,权限用途文案(本地网络)要写实。

## 6. 待用户决策(不阻塞 N0–N2)

1. 是否兼容 iOS 26 以下(降级材质)或直接 26+;
2. Apple 开发者账号(同 RUST_PLAN R3,一份决策管两条线);
3. 分发方式:TestFlight / App Store / 自签 ad hoc;
4. macOS 是否未来改走 "iPad App on Mac"(Catalyst)复用本线 —— 当前 macOS 仍走 Tauri(RUST_PLAN Phase 5)。

## 7. 进度记录(施工 agent 追加)

| 日期 | Phase | 结果/偏差 |
| --- | --- | --- |
| 2026-09-21 | — | 方案创建(评估完成,未动工) |
