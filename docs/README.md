# 代码库事实

**Status:** current
**Updated:** 2026-09-23

`docs/` 记录当前代码与已定下的持久约定。按任务选一份主题页，再核对对应代码；实现变化时同步修正事实页。本目录不承担待办队列。

| 主题 | 文档 | 主要代码来源 |
| --- | --- | --- |
| 结构与请求路径 | [架构](architecture/README.md) | `src/`、`server/`、`src-tauri/`、`ios/` |
| AdGuard Home v0.107.79 契约 | [API 契约](agh-api.md) | `src/lib/api.ts`、`scripts/mock-agh.mjs` |
| Web 端布局与交互 | [交互约定](web-interaction.md) | `src/components/`、`src/pages/`、`src/index.css` |
| Tauri 与 SwiftUI | [原生平台](native-platforms.md) | `src-tauri/`、`ios/`、`scripts/ios-signing.sh` |
| 当前实现的工程约束 | [工程约束](engineering.md) | `src/`、`server/`、`AGENTS.md` |

需要提案、技能、施工历史或验收证据时，从 `.agents/README.md` 进入对应目录；过程快照不作为当前事实来源。

## 维护约定

- 文件名用小写 kebab-case；目录索引固定为 `README.md`。
- 每页标题下写两行元信息：`**Status:**` 与 `**Updated:**`（最后核对日期，`YYYY-MM-DD`）。
- `Status` 取值：`current` 已对照代码核实；`stale` 已知与代码不一致、待核对；`draft` 尚未核实。
- 改动事实页时同步更新 `Updated`；发现内容与代码不符，先把 `Status` 改成 `stale`，再核对修正。
