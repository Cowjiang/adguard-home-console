| 2026-10-15 | process | [让应用内显示的版本与发版版本同源](proposals/process/2026-10-15-version-single-source.md) | implemented |
| 2026-10-15 | bug-fix | [修掉 iOS 工程生成在全新克隆上的失败，并保住 xcodegen 的报错输出](proposals/bug-fix/2026-10-15-ios-project-generate-fresh-clone.md) | implemented |
| 2026-10-15 | feature | [多渠道分发的检查更新与自动更新路线图](proposals/feature/2026-10-15-update-check-and-distribution-roadmap.md) | proposed |
| 2026-10-15 | feature | [统一版本清单（Manifest）与应用内检查更新闭环](proposals/feature/2026-10-15-update-check-manifest-and-ui.md) | implemented |
| 2026-10-15 | feature | [支持 CLI 启动更新提示与服务端自升级闭环](proposals/feature/2026-10-15-cli-update-and-self-upgrade.md) | implemented |
| 2026-10-17 | feature | [实例列表改为「点按切换 + 管理模式下编辑删除」](proposals/feature/2026-10-17-instance-list-manage-mode.md) | implemented |
| 2026-10-17 | bug-fix | [移动端查询日志透视分析改子页并补回丢失的浮层形态约定](proposals/bug-fix/2026-10-17-mobile-log-analytics-subpage.md) | implemented |
| 2026-10-17 | bug-fix | [把多实例聚合展示从 dev 撤下、保留在分支](proposals/bug-fix/2026-10-17-withdraw-multi-instance-aggregation.md) | implemented |
| 2026-10-17 | bug-fix | [修掉同期批次（快照/更新/测速/同步/透视）页面的设计体系失配](proposals/bug-fix/2026-10-17-batch-ui-design-conformance.md) | implemented |
| 2026-10-17 | bug-fix | [按「小面板可浮窗、超过半屏走子页」校准移动端面板形态](proposals/bug-fix/2026-10-17-mobile-content-sheets-to-subpages.md) | implemented |
| 2026-10-17 | bug-fix | [修掉概览页移动端英文文案的两处溢出](proposals/bug-fix/2026-10-17-mobile-overview-en-overflow.md) | implemented |
| 2026-10-18 | bug-fix | [让移动端趋势卡不再与图例打架，并统一图表的语义配色](proposals/bug-fix/2026-10-18-mobile-trend-legend-and-chart-colors.md) | implemented |
| 2026-10-18 | bug-fix | [修掉 iOS 原生顶栏按钮按文字固有宽度溢出、压住同槽位按钮与标题的问题](proposals/bug-fix/2026-10-18-native-header-button-overflow.md) | implemented |
| 2026-10-18 | bug-fix | [把过滤器子页的「同步到其他实例」从页头收进页底行卡片](proposals/bug-fix/2026-10-18-filter-subpage-sync-entry.md) | implemented |
| 2026-10-18 | bug-fix | [把卡片圆角收敛为两档，消掉并存的 22px 节级圆角](proposals/bug-fix/2026-10-18-card-radius-scale.md) | implemented |

## 与 docs/ 的分工

- `docs/` — 当前代码库的持久事实，入口见 `docs/README.md`。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志、旧计划快照与验收报告，记录"当时发生了什么"；旧阶段表不是当前待办。
