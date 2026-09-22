# pipelines/ — 提案生命周期

| 路径 | 用途 |
| --- | --- |
| `WORKFLOW.md` | 轨道规则、提案模板、生命周期与校验（本目录的唯一流程来源） |
| `CLASSIFICATION.md` | 封闭分类集与目录归属 |
| `proposals/<class>/` | 已提出 / 已实施的提案 |
| `rejected/<class>/` | 明确否决的提案（首次否决时创建） |
| `archives/<class>/` | 归档或被替代的提案（首次归档时创建） |

提案是**最小耐久规划单位**：不为它先拆 ticket，也不另建任务队列。

## 当前提案

| 日期 | Class | 提案 | 状态 |
| --- | --- | --- | --- |
| 2026-09-23 | process | [提案流水线与轨道规则](proposals/process/2026-09-23-proposal-pipeline.md) | implemented |

## 与 docs/ 的分工

- `docs/*_PLAN.md` — 长期蓝图与阶段划分，跨多次变更，随代码演进更新。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志与验收报告，记录"当时发生了什么"。
