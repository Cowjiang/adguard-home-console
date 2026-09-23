# 收敛 Agent 入口并按任务逐层披露

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求重新整理 `AGENTS.md`，确保它与 `.agents/`、`docs/` 形成渐进式披露链路。

## Goal

让根 `AGENTS.md` 只承载任务分流、目录索引和必须始终可见的执行约束。当前事实从 `docs/README.md` 按主题展开；提案、技能与过程记录从 `.agents/README.md` 按用途展开，减少重复和旧资料误读。

## Decision

- 根入口保留仓库定位、按任务选读路径、目录索引、全局行为约束、验证入口及 Git 发布边界。
- 目录索引每个顶层目录只写一行职责，实现细节仍由 `docs/` 主题页承载，避免两处维护同一份事实。
- 根入口说明 Direct 可直接进 `dev`、Noted 经 PR 评审进入 `dev`，与现有流水线的“提案 + PR”登记面保持一致。
- 根入口增加代码规范一节：格式与工具、代码落位、跨线共用约定与提交信息；具体实现约束仍由 `docs/engineering.md` 承载，注释与文案不写进根入口。
- 根入口单独设检查一节：按改动范围给出 Web、Rust、iOS、文档与提案的校验命令，并写明纯文档改动不必跑代码检查。
- 实现细节和领域契约以 `docs/` 主题页为单一来源；提案模板、分类、日志和技能规则以 `.agents/` 对应页面为单一来源。
- 不要求每次新增提案或技能都扩写根入口；只有入口路径或全局规则变化时才改 `AGENTS.md`。

## Accept

- [x] 从根入口可按“现状事实 / 新变更 / 历史证据 / 技能”到达正确的下一层文档
- [x] 根入口不重复主题页的实现细节，也不把历史快照列为必读
- [x] 从根入口可按路径定位每个顶层目录的职责
- [x] `.agents/README.md` 与 `docs/README.md` 的路由和维护约定与根入口一致
- [x] 根入口能直接回答「改完代码跑什么校验」，与 `.agents/pipelines/WORKFLOW.md` 的引用一致
- [x] 文档路径校验和提案校验通过

## Note

仅变更仓库工作说明，不改变产品代码。`AGENTS.md` 从 81 行收敛到 60 行（含后加的目录索引、代码规范与检查三节）；运行命令和实现约束由 `docs/README.md` 路由，技能编写约定由 `.agents/skills/README.md` 承载。`node scripts/verify-proposals.mjs --links` 检查 248 处路径，缺失 0 处；`git diff --check` 通过。
