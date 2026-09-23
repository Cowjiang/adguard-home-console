# 把架构文档拆成 docs/architecture/ 并按代码重建

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户指出 `docs/` 下的单页架构文档（`ARCHITECTURE.md`，34 行）过于笼统，要求新建 `architecture/` 目录并按代码库重建。

## Goal

把 34 行的单页架构事实扩成一组按运行形态划分的架构页：Web/PWA 运行时、React 前端、Tauri 壳、SwiftUI iOS、构建与发布链。每页写结构与接缝，关键事实能在代码里找到出处。

## Decision

- 新建 `docs/architecture/`，入口为 `docs/architecture/README.md`；原 `ARCHITECTURE.md` 删除，引用它的 `docs/README.md` 与 `docs/native-platforms.md` 改指新入口。
- 页面划分：`README.md`（交付线、状态归属与页索引）、`web-runtime.md`（Express 与开发/生产运行）、`frontend.md`（React 应用结构）、`tauri-shell.md`、`ios-app.md`、`build-and-release.md`；文件名遵循 `docs/README.md` 的小写 kebab-case 约定。
- 边界：架构目录只写结构与接缝；AGH 契约留在 `agh-api.md`，交互约定留在 `web-interaction.md`，平台坑位与签名留在 `native-platforms.md`，实现约束与验证命令留在 `engineering.md`。
- 索引分层：`docs/README.md` 只写本层主题与入口，子目录以自己的 `README.md` 作入口；目录内页面清单与各页代码入口不在上一层展开。
- 目录索引以根 `AGENTS.md` 的一行职责为路由面，架构页不重复路径清单。
- 纯文档变更，不动产品代码。

## Accept

- [x] 从 `docs/README.md` 能按主题定位到 `docs/architecture/` 的入口，再由该入口定位到具体页
- [x] `docs/README.md` 不出现子目录页面清单与代码来源
- [x] 每页主题单一，页面之间不重复同一份事实
- [x] 关键结论附源码出处（文件级路径），与代码一致
- [x] 原 `ARCHITECTURE.md` 的引用全部改指新页，无死链
- [x] `node scripts/verify-proposals.mjs --links` 不新增缺失路径

## Note

勘察范围：`server/index.mjs`、`vite.config.ts`、`src/`、`src-tauri/`、`ios/`、`scripts/`、`.github/workflows/release.yml`。分类取 `process`：本次只改文档结构与路由，不改源码结构，与既有「拆分 docs 中的持久事实与工作过程」提案同类。
