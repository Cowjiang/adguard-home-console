| 2026-10-15 | process | [让应用内显示的版本与发版版本同源](proposals/process/2026-10-15-version-single-source.md) | implemented |
| 2026-10-15 | bug-fix | [修掉 iOS 工程生成在全新克隆上的失败，并保住 xcodegen 的报错输出](proposals/bug-fix/2026-10-15-ios-project-generate-fresh-clone.md) | implemented |
| 2026-10-15 | feature | [多渠道分发的检查更新与自动更新路线图](proposals/feature/2026-10-15-update-check-and-distribution-roadmap.md) | proposed |
| 2026-10-15 | feature | [统一版本清单（Manifest）与应用内检查更新闭环](proposals/feature/2026-10-15-update-check-manifest-and-ui.md) | implemented |
| 2026-10-15 | feature | [支持 CLI 启动更新提示与服务端自升级闭环](proposals/feature/2026-10-15-cli-update-and-self-upgrade.md) | implemented |

## 与 docs/ 的分工

- `docs/` — 当前代码库的持久事实，入口见 `docs/README.md`。
- 本目录 — 单个可独立交付变更的决策与验收（Accept 清单）。
- `.agents/logs/`、`.agents/reviews/` — 施工日志、旧计划快照与验收报告，记录"当时发生了什么"；旧阶段表不是当前待办。
