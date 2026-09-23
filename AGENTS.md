# AGENTS.md

AdGuard Home v0.107.79 跨端管理控制台：Web/PWA、Tauri 2 壳和纯 SwiftUI iOS 共处一仓。

## 按任务逐层读取

从本文件获取全局约束；只打开与当前任务相关的下一层，不预读全部计划、日志或历史快照。

| 当前任务 | 第一层入口 | 继续读取 |
| --- | --- | --- |
| 理解或修改现有架构、AGH 契约、交互、平台实现 | `docs/README.md` | 选对应事实页，再核对相关代码 |
| 规划或实施非平凡的行为、架构、契约、流程变更 | `.agents/README.md` | 按提案入口读轨道规则、分类和当前提案 |
| 查找可复用的 agent 流程或编写技能 | `.agents/README.md` | 只读匹配的技能或技能编写约定 |
| 追溯故障、旧方案和验收证据 | `.agents/README.md` | 按需读 `logs/`、`reviews/`；它们记录当时状态 |

`docs/` 是当前代码库事实，随实现更新；`.agents/` 管提案、技能和过程材料。历史计划不直接充当当前待办。运行行为以代码为准，发现事实页失准时同步修正。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/` | React 前端：`pages/`、`components/`、`lib/`、`types/` |
| `server/` | Express 代理与静态托管，单文件 `index.mjs` |
| `src-tauri/` | Tauri 2 壳、Rust 代理与平台资源；`plugins/` 是本仓 Tauri 插件源码，`gen/`、`target/` 是生成物 |
| `ios/` | 纯 SwiftUI iOS 应用；`AdGuardConsole.xcodeproj` 由 xcodegen 生成，不入库 |
| `scripts/` | `mock-agh.mjs` 契约模拟、`verify-proposals.mjs` 提案校验、iOS 签名与部署、`release-notes.sh`、`server-pull.sh` |
| `docs/` | 当前代码库的持久事实，按主题从 `docs/README.md` 进入 |
| `.agents/` | 提案、技能与过程记录，按用途从 `.agents/README.md` 进入 |
| `.github/workflows/` | `release.yml`：`main` 推送时构建产物并发布 Release |

`dist/`、`node_modules/`、`src-tauri/gen/`、`src-tauri/target/` 是构建或生成产物，`_probe/` 是本机忽略材料，都不入库。

## 始终遵守

- 非平凡变更先按 `.agents/README.md` 指引登记提案，再实施；小改动走 Direct 轨。提案模板和分类以流水线文档为准。
- 不提交凭据、签名值、机器专属配置或取证截图。`_probe/` 是本机忽略材料，不可假定克隆后存在。

## 代码规范

- 仓库不配 linter / formatter，风格靠约定加 `npm run check`（`tsconfig.json` 开了 `strict`）：TS/TSX 用 2 空格缩进、单引号、不写行尾分号，Rust 与 Swift 保持 4 空格。
- 新代码按既有分层落位：页面进 `src/pages/`，通用组件与基础控件进 `src/components/`，请求、状态与工具进 `src/lib/`；Swift 按 `Features/`、`Network/`、`State/`、`Models/`、`Design/`、`Support/` 分目录；Rust 保持一文件一件事。
- 所有 AGH 请求经 `src/lib/api.ts` 的 `api()`；SWR 只用 `swrFetcher`，key 形如 `['<简称>', cfg, path]`。React Hooks 不放在条件返回之后。
- AGH 时间字段一律毫秒，`stats.top_*` 是单键对象数组、消费前归一；端点、枚举与单位以 `docs/agh-api.md` 为准，其余实现约束见 `docs/engineering.md`。
- 注释只解释约束和原因，不复述代码；背景与决策落进 `docs/` 或 `.agents/` 的 Markdown。面向用户的文案不写宣传语或口号。
- 改完按范围跑校验：Web 跑 `npm run check` 与 `npm run build`；Rust 先起 `node scripts/mock-agh.mjs` 再 `cd src-tauri && cargo test`；iOS 走 `scripts/ios-signing.sh`；文档与提案跑 `node scripts/verify-proposals.mjs`。
- commit message 用英文 conventional commit（`feat(scope):`、`fix(scope):`、`docs:`、`refactor(scope):`、`ci:`）；交流与仓库文档用中文。

## 分支与发布

- Direct 轨的小改动可直接提交到 `dev` 并推送；Noted 轨通过提案与 PR 评审后合入 `dev`。`dev` 的 push 不触发 release。
- 发布时才将 `dev` 合入 `main` 并推送；不要为日常工作直接推 `main`。
- 具体运行、检查与平台生成命令从 `docs/README.md` 进入相关事实页；提案校验从 `.agents/README.md` 进入流水线文档。
