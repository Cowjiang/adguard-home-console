# AGENTS.md

AdGuard Home v0.107.79 的跨端管理控制台：React 19 + Vite + Tailwind 4 前端，Express 反向代理后端，另有 Tauri 2 与纯 SwiftUI 两条原生线。

## 三条并行的交付线

- **Web/PWA**（`src/` + `server/`）— 主力线。Express(8787) 托管 `dist/` 并把 `/api/agh/*` 反代到 AGH `/control/*`。**AdGuard Home 不返回 CORS 头，浏览器无法直连，代理是必需品**。
- **Tauri 2 壳**（`src-tauri/`）— Windows / Android / macOS / iOS。Rust 命令 `agh_fetch` 复刻 Express 代理语义；前端 `src/lib/api.ts` 按 `window.__TAURI_INTERNALS__` 运行时分支。
- **纯 SwiftUI iOS**（`ios/`）— xcodegen 生成工程，URLSession 直连（原生无 CORS 问题，不经代理）。

## Setup commands

- 装依赖：`npm install`
- 开发：`npm run dev:all`（前端 5173 + 服务端 8787；只跑 `npm run dev` 会缺 API 代理）
- 构建：`npm run build`；生产模式：`npm start`（8787 托管 dist）
- 类型检查：`npm run check`（`tsc --noEmit`）
- 提案校验：`node scripts/verify-proposals.mjs`（改动提案的路径、分类或状态后必跑）
- Rust 测试：`cd src-tauri && cargo test`
- 本地 AGH 模拟：`node scripts/mock-agh.mjs`（监听 127.0.0.1:3990，任意非空 Basic 凭据）
- iOS 工程生成 / 构建：`./scripts/ios-signing.sh generate tauri|ios`、`./scripts/ios-signing.sh tauri build --target aarch64`

**注意**：`cargo test` 里有 3 个用例依赖 mock 服务，**mock 没跑时会静默早退但仍报 ok**。要拿到真实结论，先起 mock 再跑。

## Project layout

- `src/` — React 前端：`pages/` 页面、`components/` 组件、`lib/` API 客户端与平台工具
- `server/` — Express 代理 + 静态托管，单文件 `index.mjs`
- `src-tauri/` — Tauri 壳与 Rust 代理；`src-tauri/gen/apple/` 是生成出来的 iOS 工程
- `ios/` — 纯 SwiftUI iOS 工程（xcodegen 生成）
- `scripts/` — `mock-agh.mjs`、`ios-signing.sh`、`server-pull.sh`（服务器端拉取部署）
- `docs/` — 常青规格与知识（项目记忆、施工蓝图、交互定稿），见文末「必读文档」
- `.agents/` — agent 的能力与工作产物，约定见 `.agents/README.md`

## Code style

- 无 linter / formatter 配置，风格靠约定加 `npm run check` 把关（`tsconfig.json` 开了 `strict`）。
- **代码里不写注释** —— 决策与背景一律写进 md：常青规格进 `docs/`，过程产物（日志/报告/验收/证据）进 `.agents/`（用户明确要求）。
- **不写宣传语 / 口号式文案**（如「优雅地管理」），见到即删。
- 与用户交流用中文；commit message 用英文。
- React 侧：Hooks 不可放在条件 return 之后（曾因此白屏）；SWR 统一用 `src/lib/api.ts` 的 `swrFetcher`（readonly 元组签名）。

## 领域规则（AdGuard Home）

- **所有 duration / interval 单位是毫秒**。这是踩过两次的坑，写任何单位字段前先确认。
- `stats` 的 `top_*` 是**单键对象数组**而非字典，需归一（见 `Dashboard.tsx`）。
- Express 4 通配路由用 `app.use('/api/agh', handler)`，`app.all('/*path')` 不匹配。
- 完整 API 差异表见 `docs/PROJECT_MEMORY.md` §3；`scripts/mock-agh.mjs` 按同一契约实现，可当可执行参考。

## Git workflow

- 日常开发提交到 **`dev`** 并推送；dev 的 push **不触发** release。
- 发布 = `dev` 合并到 **`main`** 并推送，触发 `.github/workflows/release.yml` 打包 tarball。
- **不要直接推 `main`**（除非确实要发版）。纯 `docs/**`、`.agents/**` 与 `**.md` 的推送被 paths-ignore 豁免。
- commit 用英文 conventional commit：`feat(scope):` / `fix(scope):` / `docs:` / `refactor(scope):` / `ci:`。

## iOS 签名

- 签名值只放根目录 `.env.signing`（已 gitignore）：`AGH_APPLE_TEAM`、`AGH_BUNDLE_ID`。
- 两个 `project.yml` 里是 `${...}` 占位符，生成与构建一律走 `./scripts/ios-signing.sh`。
- **生成产物 `*.xcodeproj` 不入库**，克隆后先跑 `generate` 再打开 Xcode。
- 不要绕过脚本直调 `xcodegen` / `tauri ios init`：XcodeGen 对未解析的 `${...}` **不报错**（exit 0），会静默生成坏工程。

## 必读文档

- `docs/PROJECT_MEMORY.md` — **先读这个**：API 差异表(§3)、17 条踩坑清单(§7)、设计系统(§4)、Git 工作流、用户偏好(§10)
- `docs/PC_ADAPTATION.md` — 桌面适配与移动端交互定稿（选择器、图表触摸、表单行为）
- `docs/RUST_PLAN.md` / `docs/IOS_NATIVE_PLAN.md` — 两条原生线的施工蓝图与验收标准
- `_probe/` — AGH v0.107.79 的 OpenAPI 规范与真实响应样本。**已 gitignore，不随仓库分发**；单位与字段约定以 `PROJECT_MEMORY.md` §3 为准，勿假设该目录可用。
- `.agents/` — agent 的能力与产物目录，完整约定见 `.agents/README.md`：
  - `skills/` — 可复用能力与多步流程（Agent Skills 规范，跨工具可移植）。
  - `pipelines/` — 提案生命周期：非平凡的行为 / 架构 / 契约 / 流程变更，**先在 `proposals/<class>/` 登记提案再动手**，轨道规则与模板见 `.agents/pipelines/WORKFLOW.md`。
  - `logs/` / `reviews/` — 施工日志与会话存档 / 报告与验收。命名 `kebab-case`，快照类前置 `YYYY-MM-DD-`，流水类不写日期。
  - `evidence/` — 取证截图。**截图一律不提交**：该目录已被 `.gitignore` 忽略，只在本地留存；随应用分发的图标资源（`Assets.xcassets`、`src-tauri/icons/`）属 App 内容，不在此列。
