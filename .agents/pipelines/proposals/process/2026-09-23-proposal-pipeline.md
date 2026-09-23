# 引入提案流水线与轨道规则

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求把其在另一项目的成熟工作流移植进本仓，范围限定为轨道规则、提案流水线、封闭分类与校验脚本。

## Goal

让"接下来做什么"和"怎么算做完"有单一登记面：非平凡变更先在提案里写清目标与可观察的验收，完成后再留下状态。此前这些信息散在 `docs/*_PLAN.md` 的阶段表、施工日志与会话里，没有统一的当前决策面，约定也会随引用失修。

## Decision

- 轨道分 Direct（小事、无耐久决策 → 直接提交）与 Noted（非平凡的行为 / 架构 / 契约 / 流程变更 → 提交 + 提案）。
- 封闭分类集沿用 `feature / bug-fix / architecture / simplification / process / testing`；`refactor` 与 `docs` 不入集。
- 提案文件名与 `reviews/` 快照统一为 `YYYY-MM-DD-<slug>.md`。
- 登记面是**提案 + PR**；本仓不引入 issue 跟踪。
- 不引入证据目录协议（`before/`、`changes.patch`、`verification.json`）与本机双轨 `AGENTS.local.md`：记录继续随仓库分发。
- `docs/*_PLAN.md` 继续承载跨变更的长期蓝图，提案只承载单个可独立交付的变更。

## Accept

- [x] `.agents/pipelines/` 建立：`WORKFLOW.md`、`CLASSIFICATION.md` 与 `proposals/` 下六个分类目录
- [x] `scripts/verify-proposals.mjs` 校验文件名、分类目录、状态与 `reviews/` 快照命名，且在本仓当前状态下通过
- [x] 根 `AGENTS.md` 与 `.agents/README.md` 同步登记面、轨道规则与校验命令
- [x] 提案与 `docs/*_PLAN.md` 的分工写进 `WORKFLOW.md` 的「边界」一节

## Note

轨道规则与模板见 `.agents/pipelines/WORKFLOW.md`，分类见 `CLASSIFICATION.md`。本提案与流水线同批落地，属事后登记；此后 Noted 轨的变更应在动手前登记。

2026-09-23：本提案中关于 `docs/*_PLAN.md` 继续承载跨变更蓝图的决定，已由 `.agents/pipelines/proposals/process/2026-09-23-separate-durable-docs.md` 更新；现行边界以 `.agents/pipelines/WORKFLOW.md` 为准。
