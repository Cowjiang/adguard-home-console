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
| 2026-09-24 | process | [给 iOS 工程生成加门禁，并把受控项移进 tauri 配置](proposals/process/2026-09-24-ios-project-generation-gate.md) | implemented |
| 2026-09-24 | bug-fix | [把 Rust 静态库从 app 包的资源阶段摘掉](proposals/bug-fix/2026-09-24-ios-bundle-ships-libapp-archive.md) | implemented |
| 2026-09-24 | bug-fix | [让移动端客户端页获得原生返回按钮与侧滑返回](proposals/bug-fix/2026-09-24-clients-back-nav.md) | implemented |
| 2026-09-24 | bug-fix | [顶栏右侧按钮高度统一对齐返回胶囊](proposals/bug-fix/2026-09-24-header-action-height.md) | implemented |
| 2026-09-24 | bug-fix | [日志页筛选状态同步进 URL，避免返回时被旧筛选覆盖](proposals/bug-fix/2026-09-24-log-filter-url-sync.md) | implemented |
| 2026-09-24 | bug-fix | [修掉原生选择器覆盖层撑宽文档导致的页面横向拖动](proposals/bug-fix/2026-09-24-native-select-doc-overflow.md) | implemented |
| 2026-09-24 | feature | [把 iOS 壳的顶栏操作按钮改成原生液态玻璃](proposals/feature/2026-09-24-native-glass-header-actions.md) | implemented |
| 2026-09-23 | process | [把架构文档拆成 docs/architecture/ 并按代码重建](proposals/process/2026-09-23-architecture-docs-rebuild.md) | implemented |
| 2026-09-23 | process | [统一 docs 的文件名与页面元信息](proposals/process/2026-09-23-docs-naming-and-metadata.md) | implemented |
| 2026-09-24 | feature | [为 React UI 引入中英双语](proposals/feature/2026-09-24-ui-i18n.md) | implemented |
| 2026-09-25 | feature | [为移动端增加下拉刷新并修复断网后的刷新冻结](proposals/feature/2026-09-25-refresh-triggers.md) | implemented |
| 2026-09-25 | feature | [收敛下拉刷新触发范围并补上断网后的离线反馈](proposals/feature/2026-09-25-refresh-scope-and-offline-feedback.md) | implemented |
| 2026-09-25 | feature | [语言设置增加跟随系统并改为下拉选择](proposals/feature/2026-09-25-language-follow-system.md) | implemented |
| 2026-09-25 | feature | [补齐 DHCP 设置页与 AGH 原生功能的差距](proposals/feature/2026-09-25-dhcp-page-parity.md) | implemented |
| 2026-09-26 | feature | [补齐常规设置页「被忽略的域名」功能](proposals/feature/2026-09-26-general-settings-ignored-domains.md) | implemented |
| 2026-09-26 | feature | [补齐加密设置页与 AGH 原生功能的差距](proposals/feature/2026-09-26-encryption-page-parity.md) | implemented |
| 2026-09-26 | feature | [将统计分析页合并进概览页（仅桌面）](proposals/feature/2026-09-26-merge-stats-into-overview.md) | implemented |
| 2026-10-06 | architecture | [上移 AGH 代理契约为前端持有的接口，Express/Rust 作为可替换实现](proposals/architecture/2026-10-06-proxy-contract-ownership.md) | implemented |
| 2026-10-06 | simplification | [收敛 src/ 页面层的重复编排、探测状态机与超载文件](proposals/simplification/2026-10-06-src-layer-consolidation.md) | implemented |
| 2026-10-07 | simplification | [收干净 Rust 壳与插件 fork 的失修项：失效配置、构建生成物与不可复现的 delta](proposals/simplification/2026-10-07-rust-shell-fork-consolidation.md) | implemented |
| 2026-10-07 | bug-fix | [对齐 tauri crate 与 npm 的版本，退掉第三方 tao 补丁](proposals/bug-fix/2026-10-07-tauri-version-align.md) | implemented |
| 2026-10-07 | bug-fix | [修回 iOS 工程的 pre-build 脚本调用方式，让 Xcode 阶段不再 panic](proposals/bug-fix/2026-10-07-ios-xcode-script-phase.md) | implemented |
| 2026-10-07 | bug-fix | [修回 iOS release 构建的 Swift 静态链接](proposals/bug-fix/2026-10-07-ios-release-swift-link.md) | implemented |
| 2026-10-07 | process | [把发版拆成 GitHub Release / npm / GHCR 三个消费者](proposals/process/2026-10-07-multi-channel-release.md) | implemented |
| 2026-10-12 | feature | [为多实例增加集群级防护并发控制](proposals/feature/2026-10-12-multi-instance-cluster-protection.md) | implemented |
| 2026-10-12 | feature | [为多实例增加 DNS 重写与自定义规则单向同步](proposals/feature/2026-10-12-multi-instance-rules-sync.md) | implemented |
| 2026-10-13 | process | [为 Pull Request 和核心分支增加自动化 CI 检查](proposals/process/2026-10-13-pull-request-ci-workflow.md) | implemented |
| 2026-10-13 | feature | [多实例运维能力闭环套件（P1: 订阅列表同步、客户端同步与健康矩阵面板）](proposals/feature/2026-10-13-multi-instance-cluster-operations.md) | implemented |

## 与 docs/ 的分工

- `docs/` — 当前代码库的持久事实，入口见 `docs/README.md`。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志、旧计划快照与验收报告，记录"当时发生了什么"；旧阶段表不是当前待办。
