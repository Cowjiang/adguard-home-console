# 代码库事实

`docs/` 记录当前代码与已定下的持久约定。按任务选一份主题页，再核对对应代码；实现变化时同步修正事实页。本目录不承担待办队列。

| 主题 | 文档 | 主要代码来源 |
| --- | --- | --- |
| 三条交付线与请求路径 | [架构](ARCHITECTURE.md) | `src/App.tsx`、`src/lib/api.ts`、`server/index.mjs` |
| AdGuard Home v0.107.79 契约 | [API 契约](AGH_API.md) | `src/lib/api.ts`、`scripts/mock-agh.mjs` |
| Web 端布局与交互 | [交互约定](WEB_INTERACTION.md) | `src/components/`、`src/pages/`、`src/index.css` |
| Tauri 与 SwiftUI | [原生平台](NATIVE_PLATFORMS.md) | `src-tauri/`、`ios/`、`scripts/ios-signing.sh` |
| 当前实现的工程约束 | [工程约束](ENGINEERING.md) | `src/`、`server/`、`AGENTS.md` |

需要提案、技能、施工历史或验收证据时，从 `.agents/README.md` 进入对应目录；过程快照不作为当前事实来源。
