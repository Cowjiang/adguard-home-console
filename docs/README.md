# 代码库事实

`docs/` 记录当前代码与已定下的持久约定。改动实现时同步修正对应事实页；日期化的方案、调研、交接、验证和施工记录放在 `.agents/`。本目录不承担待办队列。

| 主题 | 文档 | 主要代码来源 |
| --- | --- | --- |
| 三条交付线与请求路径 | [架构](ARCHITECTURE.md) | `src/App.tsx`、`src/lib/api.ts`、`server/index.mjs` |
| AdGuard Home v0.107.79 契约 | [API 契约](AGH_API.md) | `src/lib/api.ts`、`scripts/mock-agh.mjs` |
| Web 端布局与交互 | [交互约定](WEB_INTERACTION.md) | `src/components/`、`src/pages/`、`src/index.css` |
| Tauri 与 SwiftUI | [原生平台](NATIVE_PLATFORMS.md) | `src-tauri/`、`ios/`、`scripts/ios-signing.sh` |
| 当前实现的工程约束 | [工程约束](ENGINEERING.md) | `src/`、`server/`、`AGENTS.md` |

工作登记与历史：

- 当前提案和轨道规则：`.agents/pipelines/README.md`、`.agents/pipelines/WORKFLOW.md`。
- 施工日志：`.agents/logs/`；一次性的方案、调研与验收快照：`.agents/reviews/`。
- 截图证据：本地 `.agents/evidence/`，被 Git 忽略；历史提交仍可从 Git 找回。
- 2026-09-23 迁移前的混合文档保存在 `.agents/reviews/2026-09-23-*-snapshot.md` 等同日快照中。它们记录当时状态，不作为当前事实来源。
