# 规范 Docker 托管模式盲存储数据卷挂载与文档对齐

**Class:** process
**Status:** implemented
**Date:** 2026-10-21
**Source:** 用户反馈 README 与 Docker 镜像需对齐托管模式加密存储说明；上游提案 `.agents/pipelines/proposals/feature/2026-10-17-console-managed-mode.md`、`.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`

## Goal

在引入托管模式（零知识端到端加密盲存储）前，AdGuard Home Console 的服务端完全无状态（Stateless），无任何本地持久化需求。
引入托管模式后，服务端在 `/api/managed/*` 下提供基于本地目录的盲存储（实例元数据 `instances.json`、E2EE 加密快照及索引）。若用户在 Docker 容器内使用托管模式，需要挂载持久卷以避免容器重建或镜像升级时加密快照丢失；同时 Dockerfile 需在构建阶段为非 root 用户（`node`）初始化 `/app/data` 并赋予正确权限。

目标：
1. 更新 `Dockerfile`：在运行阶段显式创建 `/app/data`、授权 `node:node`、声明 `VOLUME /app/data` 并配置 `ENV AGH_DATA_DIR=/app/data`。
2. 更新中英文 `README.md` 与 `docs/assets/README.zh-CN.md`：
   - 阐明直连模式（无状态）与托管模式（端侧零知识 E2EE 盲存储）的区别。
   - 分别提供直连模式与托管模式的 `docker run` 与 `docker compose` 挂载卷示例（`-v agh-data:/app/data`）。
   - 在环境变量配置表中补齐 `AGH_DATA_DIR` 说明。
   - 更新“工作原理”（How it works）架构图，反映双模式数据流。
3. 同步更新 `docs/architecture/web-runtime.md` 中的路由表与持久化目录优先级。

## Decision

1. **统一数据挂载路径为 `/app/data`**：
   - 服务端代码 `server/managed.mjs` 中的数据目录解析规则为 `options.dataDir > env.AGH_DATA_DIR > env.DATA_DIR > <ROOT>/data`。在 Docker 容器内 `<ROOT>` 即 `/app`，默认路径天然解析为 `/app/data`。
   - `Dockerfile` 中显式 `RUN mkdir -p /app/data && chown -R node:node /app/data`，避免非 root 用户运行时的 `EACCES` 权限问题。
   - 声明 `VOLUME /app/data` 与 `ENV AGH_DATA_DIR=/app/data`，契约明确。
2. **文档双模式清晰分流**：
   - **直连模式**：强调纯无状态，无需挂载卷，凭据与快照全留在浏览器。
   - **托管模式**：清晰指导用户挂载卷，说明服务端只存储客户端 AES-256-GCM 加密后的密文与 Salt 元数据，杜绝明文泄露。

## Accept

- [x] `Dockerfile` 预建 `/app/data`、授权 `node:node` 并声明 `VOLUME /app/data` 与 `ENV AGH_DATA_DIR=/app/data`
- [x] `README.md` 与 `docs/assets/README.zh-CN.md` 更新直连与托管双模式、Docker 与 Compose 卷挂载说明、配置表与架构图
- [x] `docs/architecture/web-runtime.md` 更新 `/api/managed` 路由与存储目录解析说明
- [x] `node scripts/verify-proposals.mjs --links` 通过
- [x] `pnpm check` 与 `pnpm test:server` 绿灯通过
