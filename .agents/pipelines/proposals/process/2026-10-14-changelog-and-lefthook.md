# 引入 Lefthook、Action 脚本收敛、自动打 Tag 与 Changelog 体系

**Class:** process
**Status:** implemented
**Date:** 2026-10-14
**Source:** 用户需求——引入本地 Git 钩子拦截（Lefthook）、收敛 CI/Action 脚本到 `.github/scripts/`、实现发版自动化打 Tag 及 Changelog 结构化归档。

## Goal

目前仓库在质量保证与发布体系上已具备完善的 CI 检查（`.github/workflows/ci.yml`）与多通道发布流水线（`scripts/release-plan.mjs`、`.github/workflows/release.yml`）。然而在开发者工作流、脚本组织与发版自动化上仍存在以下演进空间：
1. **本地质量门禁与提交规范无拦截**：虽然团队已自觉遵循 Conventional Commits（`feat(...)`、`fix(...)` 等），但本地完全缺乏 git hook 约束；错误的 commit message、未通过 proposal 校验的暂存或低级语法错误只能在推送到远端 CI 后才被捕获，浪费 CI 资源与反馈周期。
2. **Action 自动化脚本与本地开发脚本混杂**：当前 `scripts/` 目录下既包含面向本地开发与真机调试的工具（如 `ios-signing.sh`、`mock-agh.mjs`、`verify-proposals.mjs`），也混杂了纯为 GitHub Actions 服务的工作流脚本（如 `release-notes.sh`、`release-plan.mjs`），职责划分不够清晰。
3. **发版仍依赖手动打 Tag**：当前 Stable 发版必须由维护者在本地手动计算 SemVer 版本号、执行 `git tag vX.Y.Z` 并 push 到 GitHub。该方式存在人工计算错误、本地工作区不干净或跳过前置验证打错 tag 的隐患。
4. **缺乏结构化、持久化的 Changelog**：当前发布笔记仅将原始 git log 代码块临时填入 GitHub Release 描述中；仓库内没有可供终端用户（Web/Docker/npm/Tauri/iOS）直观查阅的 `CHANGELOG.md`，也未对 breaking changes、新特性、缺陷修复做语义化分类。

本提案旨在通过四大模块的工程化改造，实现从“本地提交规范拦截”到“流水线自动化打 Tag 与 Changelog 发布”的完整闭环。

## Decision

1. **Git 钩子管理器选型：Lefthook**
   - **选型原因**：相比传统的 Husky + lint-staged，Lefthook 基于 Go 编写，性能极高（执行速度毫秒级），支持并行多任务调度，且不强依赖 Node.js 单一环境，对于同时包含 React/TS、Node Server、Tauri/Rust 以及 Shell 脚本的多语言仓库友好。
   - **Hook 职责切分（遵循轻量无感原则，避免阻塞本地流）**：
     - `commit-msg`：通过 `@commitlint/cli` + `@commitlint/config-conventional` 强制校验提交信息格式，拦截不规范的 commit。
     - `pre-commit`：仅针对 staged 文件进行快速检查（如防意外提交大文件或临时敏感信息）；禁止在 `pre-commit` 中挂载重度全量构建（如 `pnpm build` 或 iOS 打包），保证提交毫秒级完成。
     - `pre-push`：执行轻量门禁快速反馈，如 `node scripts/verify-proposals.mjs` 与 `pnpm check`（TypeScript 类型检查），阻断显式类型错误推送至远端。
   - **安装与激活**：在 `package.json` 的 devDependencies 中引入 `lefthook`，并在 `pnpm prepare` / postinstall 阶段通过带环境防守脚本自动执行 `lefthook install`（兼容 Docker 等无 `.git` 环境）。

2. **Action 专用脚本收敛至 `.github/scripts/`**
   - **清晰的目录边界**：
     - `.github/scripts/`：专属于 GitHub Actions / CI / CD 流水线的自动化脚本，如 `release-plan.mjs`、`release-notes.sh`、自动打 Tag 脚本等。
     - `scripts/`：专注于本地开发者体验、模拟调试与通用工程门禁工具，如 `ios-signing.sh`、`ios-deploy.sh`、`mock-agh.mjs`、`verify-proposals.mjs`、`server-pull.sh`。
   - **平滑迁移与路径修正**：
     - 迁移 `scripts/release-notes.sh` -> `.github/scripts/release-notes.sh`。
     - 迁移 `scripts/release-plan.mjs` -> `.github/scripts/release-plan.mjs`。
     - 根目录下保留对应的 Shim 代理层，确保历史引用零中断。
     - 同步更新 `package.json` 中的命令（如 `test:release`）及 `.github/workflows/` 中的调用路径。

3. **发版自动化打 Tag（废除手工打 Tag）与版本规则分层**
   - **目标流转机制**：不再需要人工在本地执行 `git tag vX.Y.Z && git push`。
   - **版本变更规则分层（核心决策更新）**：
     - **大版本（Major）必须人工指定**：流水线的 `auto` 自动推导逻辑永远不会自动跨越大版本（不会自动升 `1.0.0` 或 `2.0.0`），大版本发布必须由维护者在 Actions 界面显式选择 `type: major` 或 `type: custom`。
     - **架构重构与破坏性变更为中间版本变更（Minor）**：当包含 `feat:`、`refactor:`、破坏性变更（`BREAKING CHANGE:` / `!:`）时，`auto` 自动判定为 `minor`（次版本号/中间版本号递增，如 `0.1.0` -> `0.2.0`）。
     - **常规维护与缺陷修复为小版本变更（Patch）**：当仅包含 `fix:`、`perf:`、`docs:`、`chore:` 等维护提交时，`auto` 自动判定为 `patch`（如 `0.1.0` -> `0.1.1`）。
   - **自动化动作**：
     - Action 自动校验 CI 门禁 -> 执行版本号递增（同步更新 `package.json`、`src-tauri/tauri.conf.json`、iOS 等）-> 生成/更新 `CHANGELOG.md` -> 创建 GitHub Release Tag 并推送 -> 触发全渠道构建与发布（npm / Docker / Tauri / iOS）。
     - 配备双保险触发机制（支持 `RELEASE_PAT`，无 PAT 时自动 fallback 调用 `gh workflow run`），彻底规避 GitHub Actions 递归抑制问题。

4. **Changelog 体系自动化与结构化归档**
   - **生成引擎**：采用 `git-cliff`（`cliff.toml` 模板定制）配合轻量 Node.js Conventional Commits 解析器作为无依赖兜底方案。
   - **规则分类**：
     - `BREAKING CHANGE`: 🚨 Breaking Changes（独立置顶分区）
     - `feat`: ✨ Features（新增特性）
     - `fix`: 🐛 Bug Fixes（缺陷修复）
     - `perf`: ⚡ Performance Improvements（性能优化）
     - `refactor`: ♻️ Code Refactoring（代码重构）
     - `docs`: 📝 Documentation（文档变更）
   - **多端与用户可读性**：
     - 在根目录维护持久化的 `CHANGELOG.md`。
     - 当流水线自动创建 Stable Release 时，自动更新 `CHANGELOG.md` 并将其前置作为 GitHub Release 正文。
     - Nightly 频道继续保留快速滚动与简要变更说明，避免频繁刷屏污染主版本的清晰日志。

## Accept

- [x] 新增 `lefthook.yml` 配置文件，配置 `commit-msg`、`pre-commit` 及 `pre-push` 钩子。
- [x] 在 `package.json` 中引入 `lefthook` 与 commitlint 相关依赖，配置 `prepare` 自动初始化（含无 git 环境防御）。
- [x] 验证 `commit-msg` 钩子能够成功拦截非规范 commit（如 `test msg`），并允许规范 commit（如 `feat(core): add ...`）。
- [x] 将纯 Actions 相关脚本收敛迁移至 `.github/scripts/`，并同步更新 workflows 及 npm 脚本中相关路径引用。
- [x] 实现自动化打 Tag 流程，解除对本地手工 `git tag && git push` 的依赖。
- [x] 调整版本推导规则：大版本（Major）必须人工指定，破坏性变更与架构重构在自动模式下走中间版本（Minor）。
- [x] 制定 Changelog 生成配置与模板（如 `cliff.toml`），定义语义解析规则，实现发版时自动更新 `CHANGELOG.md`。
- [x] 运行 `node scripts/verify-proposals.mjs` 校验通过，无路径缺失或格式错误。
