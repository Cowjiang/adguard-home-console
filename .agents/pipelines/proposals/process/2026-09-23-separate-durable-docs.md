# 拆分 docs 中的持久事实与工作过程

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求按新工作流整理 `docs/`，以后只在 `docs/` 维护代码库的持久事实。

## Goal

让 `docs/` 只保存当前仍成立、需要随代码持续维护的架构、契约、交互与平台约定。把待实施计划、历史调研、交接、修复经过和验收截图移入 `.agents/` 的决策或过程位置，避免历史快照被当成当前事实。

## Decision

- `docs/` 按稳定主题拆分，并提供入口与事实来源；不再把施工进度和会话恢复信息混入事实页。
- 尚未完成的工作以提案为当前决策面；跨阶段旧计划保留为过程材料，具体可执行的下一块工作再从中登记提案。
- 一次性调研、诊断、交接与验收放入 `.agents/reviews/` 或 `.agents/logs/`；截图放入本地忽略的 `.agents/evidence/`。
- 修正仓库内对旧文档路径的引用，并同步 `AGENTS.md` 与流水线边界说明。

## Accept

- [x] `docs/` 中只剩当前有效的持久事实和索引，旧计划及过程快照移出
- [x] 旧项目记忆文件的混合内容按主题拆分，过期的机器状态和已失效方案不会进入事实页
- [x] 旧计划和过程材料保留可追溯来源，待办项有明确的登记归属
- [x] 仓库内指向旧路径的引用更新，文档链接可解析
- [x] `node scripts/verify-proposals.mjs` 与相应的文档检查通过

## Note

仅整理文档及其引用；不改变产品行为。旧文档作为带迁移说明的历史快照放在 `.agents/reviews/`；原先随仓库跟踪的截图移至本地忽略的 `.agents/evidence/`。

验证：`node scripts/verify-proposals.mjs --links`、`npm run check`、`npm run build`，以及运行 mock 服务后的 `cargo test`（11 项）均通过。
