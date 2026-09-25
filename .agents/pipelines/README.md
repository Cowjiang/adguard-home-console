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
| 2026-09-23 | process | [修正 release 工作流的变更列表与历史保留策略](proposals/process/2026-09-23-release-notes-and-history-retention.md) | implemented |
| 2026-09-23 | process | [收敛 Agent 入口并按任务逐层披露](proposals/process/2026-09-23-progressive-agent-entrypoints.md) | implemented |
| 2026-09-24 | simplification | [弃用并移除 SwiftUI 原生 iOS 线](proposals/simplification/2026-09-24-retire-swift-ios-line.md) | implemented |
| 2026-09-24 | process | [给 iOS 工程生成加门禁，并把可控项移进 tauri 配置](proposals/process/2026-09-24-ios-project-generation-gate.md) | implemented |
| 2026-09-24 | bug-fix | [把 Rust 静态库从 app 包的资源阶段摘掉](proposals/bug-fix/2026-09-24-ios-bundle-ships-libapp-archive.md) | implemented |
| 2026-09-23 | process | [把架构文档拆成 docs/architecture/ 并按代码重建](proposals/process/2026-09-23-architecture-docs-rebuild.md) | implemented |
| 2026-09-23 | process | [统一 docs 的文件名与页面元信息](proposals/process/2026-09-23-docs-naming-and-metadata.md) | implemented |
| 2026-09-24 | feature | [为 React UI 引入中英双语](proposals/feature/2026-09-24-ui-i18n.md) | implemented |
| 2026-09-25 | feature | [为移动端增加下拉刷新并修复断网后的刷新冻结](proposals/feature/2026-09-25-refresh-triggers.md) | implemented |
| 2026-09-25 | feature | [收敛下拉刷新触发范围并补上断网后的离线反馈](proposals/feature/2026-09-25-refresh-scope-and-offline-feedback.md) | implemented |
| 2026-09-25 | process | [公开发布 web 版并建立三通道分发](proposals/process/2026-09-25-open-source-webui-release.md) | proposed |
| 2026-09-25 | feature | [构建移动端增值层:系统级集成与授权分发](proposals/feature/2026-09-25-mobile-premium-tier.md) | proposed |

## 与 docs/ 的分工

- `docs/` — 当前代码库的持久事实，入口见 `docs/README.md`。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志、旧计划快照与验收报告，记录"当时发生了什么"；旧阶段表不是当前待办。
