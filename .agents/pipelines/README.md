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
| 2026-09-23 | bug-fix | [修正客户端排序控件的原生选择器与等高](proposals/bug-fix/2026-09-23-clients-sort-native-select.md) | implemented |
| 2026-09-23 | bug-fix | [让深色浮层显示玻璃并修复 backdrop-filter 前缀失效](proposals/bug-fix/2026-09-23-glass-popover-blur.md) | implemented |
| 2026-09-23 | process | [拆分 docs 中的持久事实与工作过程](proposals/process/2026-09-23-separate-durable-docs.md) | implemented |

## 与 docs/ 的分工

- `docs/` — 当前代码库的持久事实，入口见 `docs/README.md`。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志、旧计划快照与验收报告，记录"当时发生了什么"；旧阶段表不是当前待办。
