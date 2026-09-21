# iOS 会话施工总日志(编排视角)

> 2026-09-21。本文由编排 agent 维护,汇总两条并行线;各线细节见 `TAURI_IOS_LOG.md`(Tauri 壳)与 `IOS_NATIVE_LOG.md`(SwiftUI 原生)。
> 用户指令:① 优先按 `RUST_PLAN.md` Phase 5.5 用 Tauri + 第三方插件先做一版;② 同时按 `IOS_NATIVE_PLAN.md` 做纯原生版;③ 代码放各自新目录;④ 只用 mock 数据,不访问真实服务;⑤ 过程记录进 md。

## 1. 环境盘点(已核实)

| 项 | 值 | 影响 |
| --- | --- | --- |
| Xcode | **27.0 (27A266a)**,iOS 27.0 SDK | 比 `IOS_NATIVE_PLAN` 假设的 Xcode 26 新一版;液态玻璃 API 以 iOS 27 SDK 实测为准(计划文档已预留此偏差) |
| 模拟器 | iOS 27.0 runtime:iPhone 18 Pro / 18 Pro Max / 17e / Air / 17 / iPad 系列 | 分配:Tauri 线 → iPhone 18 Pro;原生线 → iPhone 17(避免截图互相干扰) |
| Rust | cargo 1.89.0,iOS targets 需补装 | Tauri 线第一步 `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` |
| xcodegen | brew 安装成功 | 原生线用它生成工程,避免手写 pbxproj |
| tauri-cli | 需 brew 安装(Tauri 线自装) | — |
| 目标实例 | `http://100.76.99.57:3990` **不可达**(本机 Tailscale 未连,HTTP:000) | 用户随后确认:直接用 mock,不访问真实服务 |

## 2. 共享基础设施(编排层建设,两线共用)

- **mock AGH 服务器**:`scripts/mock-agh.mjs`(Node 内置 http,零依赖),`nohup` 常驻 `127.0.0.1:3990`,日志 `/tmp/mock-agh.log`。
  - 严格按 `PROJECT_MEMORY.md` §3 契约实现:interval/duration 毫秒;`avg_processing_time`、`top_upstreams_avg_time` 为**秒**(浮点,对齐 Web 版 `fmtMs` 语义);stats `top_*` 为单键对象数组;reason 12 枚举;querylog 支持 search/reason[]/older_than/offset/limit。
  - `POST /protection {enabled, duration}` 修改内存状态,`/status` 立即回读 → 可端到端测试防护开关与倒计时。
  - 鉴权:任意非空 Basic 凭据(推荐 admin/demo);缺 Authorization → 401。
  - 已验证:status/stats(数组形态 KVMap)/querylog/401 全部正常。
- **.gitignore 追加**:ios/DerivedData、xcuserdata、xcresult、src-tauri/target 等(Xcode/Tauri 施工产物)。
- 注意:仓库 `.gitignore` 含 `*.md`(仅 README 例外),docs 下的日志文件不会进 git,属本地记录。

## 3. 两线分工与并行策略

| 线 | 目录 | 蓝图 | 最终状态(2026-09-21 07:00) |
| --- | --- | --- | --- |
| Tauri 壳(优先) | `src-tauri/` + `gen/apple/`(tauri ios init 生成) | RUST_PLAN Phase 1/2/5.5 | **✅ 完成并验收**:cargo test 11/11、clippy 绿;混合壳跑通(WebView=React 原前端 + 原生液态玻璃 UITabBar + JS 路由双向同步);**视觉验收 96/100 通过**;4 张截图。坑:iOS 27 强制 UIScene(tao patch)、窗口须显式声明、bundle id 与原生线撞车(遗留用户决策) |
| SwiftUI 原生 | `ios/`(xcodegen 工程) | IOS_NATIVE_PLAN N0–N3 | **✅ 完成 + 两轮 UI 收敛**:解码测试 10/10、UI 测试 2/2;第一轮 Top1–Top5(视觉验收 78 分)→ 第二轮 R1–R10 全部落地(环形图/渐变防护卡/状态胶囊/图表轴/两页入口组/实时徽标/登录 field/查看更多);9 张截图与 Web 版对齐 |
| 视觉验收(编排层) | docs/IOS_VISUAL_ACCEPTANCE.md | 用户指令 #9 | **✅ 完成**:两版逐页验收表;第二轮清单 R1–R10(已全部施工);无法复刻项 8 条已报备(核心:液态玻璃透镜动效系统更优、玻璃折射参数、大面积背板模糊=性能红线、悬浮玻璃顶栏用内联胶囊替代) |

冲突隔离:目录互斥、模拟器设备互斥(Tauri=iPhone 18 Pro,原生=iPhone 17)、日志文件互斥(`TAURI_IOS_LOG.md` / `IOS_NATIVE_LOG.md`),mock 服务器由编排层管理,两个 agent 只读使用。

### 原生线要点(明细见 IOS_NATIVE_LOG.md)
- 交付:`ios/` 完整工程(N0 脚手架 → N3 概览全功能;过滤器/日志/设置 tab 顺带做了基础版),9 张验收截图(`docs/shots-native/`)。
- 测试立功:抓出 **ProtectionCard Toggle 漏"打开"分支**的产品 bug(对齐 Web 版 Switch 正向分支后修复)。
- 环境坑(两线共用):brew 在 macOS 27 不可用 → xcodegen 走 GitHub release + Clash 代理(127.0.0.1:7890,用户提供);XCUITest 的 segmented Picker 段是 button 不是 staticText;UI 测试必须幂等(mock 状态会被端到端用例改写)。

## 4. 编排层待办(两线完成后)

- [x] 原生线截图审查(01–09 全部过目,数据与 mock 一致,材质/文案符合用户口味)
- [x] 回填 `IOS_NATIVE_PLAN.md` §4 勾选与 §7 进度表(N0–N3)
- [ ] 审查 Tauri 线截图与日志,回填 `RUST_PLAN.md` §7 与 Phase 5.5 结论
- [ ] 汇总 spike 结论:Phase 5.5 决策规则(材质统一/滚动跟手/稳定)→ 继续 Tauri 还是回退纯原生
