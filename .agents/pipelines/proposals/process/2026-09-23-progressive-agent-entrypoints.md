# 收敛 Agent 入口并按任务逐层披露

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求重新整理 `AGENTS.md`，确保它与 `.agents/`、`docs/` 形成渐进式披露链路。

## Goal

让根 `AGENTS.md` 只承载任务分流和必须始终可见的执行约束。当前事实从 `docs/README.md` 按主题展开；提案、技能与过程记录从 `.agents/README.md` 按用途展开，减少重复和旧资料误读。

## Decision

- 根入口保留仓库定位、按任务选读路径、全局行为约束、验证入口及 Git 发布边界。
- 根入口说明 Direct 可直接进 `dev`、Noted 经 PR 评审进入 `dev`，与现有流水线的“提案 + PR”登记面保持一致。
- 实现细节和领域契约以 `docs/` 主题页为单一来源；提案模板、分类、日志和技能规则以 `.agents/` 对应页面为单一来源。
- 不要求每次新增提案或技能都扩写根入口；只有入口路径或全局规则变化时才改 `AGENTS.md`。

## Accept

- [x] 从根入口可按“现状事实 / 新变更 / 历史证据 / 技能”到达正确的下一层文档
- [x] 根入口不重复主题页的实现细节，也不把历史快照列为必读
- [x] `.agents/README.md` 与 `docs/README.md` 的路由和维护约定与根入口一致
- [x] 文档路径校验和提案校验通过

## Note

仅变更仓库工作说明，不改变产品代码。`AGENTS.md` 从 81 行收敛到 29 行；运行命令和实现约束由 `docs/README.md` 路由，技能编写约定由 `.agents/skills/README.md` 承载。`node scripts/verify-proposals.mjs --links` 检查 173 处路径，缺失 0 处；`git diff --check` 通过。
