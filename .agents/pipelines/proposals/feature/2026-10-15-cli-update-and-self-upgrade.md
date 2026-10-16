# 支持 CLI 启动更新提示与服务端自升级闭环

**Class:** feature
**Status:** implemented
**Date:** 2026-10-15
**Source:** 基于 [多渠道分发的检查更新与自动更新路线图](2026-10-15-update-check-and-distribution-roadmap.md)，推进阶段二「CLI 启动更新横幅与服务端半自动更新」落地
**Updated:** 2026-10-16

## Goal

在阶段一完成统一 Manifest 资产发布、服务端 `/api/system/version` 查询与前端关于页检测闭环的基础上，阶段二聚焦于将更新能力下沉到**运行终端**与**自部署运维**场景：

1. **npm / npx 渠道缺乏终端直观提示**：通过 `npx agh-console` 或全局安装运行的用户大部分通过终端交互，无法在启动时得知有新版本发布，往往长期停留在旧版本。
2. **Linux 裸机 / systemd 部署需手动登机运维**：虽然仓库提供了 `scripts/server-pull.sh`，但依赖管理员登录服务器或手动配置 cron/timer；用户在 Web 控制台发现新版本后，无法直接在界面上一键完成升级与重启。

**阶段二目标**：
1. 在 CLI 启动流程中增加非阻塞、轻量级终端更新提示横幅（内置 24 小时本地缓存与静默规则）。
2. 现代化改造 `scripts/server-pull.sh`（支持公开免 Token、支持参数化检测与自测）。
3. 在 Express 中实现受安全开关（`AGH_ENABLE_SELF_UPGRADE`）保护的自升级管理接口与状态机。
4. 在前端更新详情弹窗中为支持自升级的运行环境提供「一键升级并重启」操作及重启轮询重连闭环。

---

## Decision

### 1. CLI 启动更新检测与终端横幅 (`server/cli-update.mjs`)
- **非阻塞后台检测**：
  - 在 `server/index.mjs` 启动完成并输出服务监听地址后，通过异步调用触发 `checkCliUpdate()`，不阻塞主服务监听与首屏响应。
- **展示触发条件**：
  - 仅在输出目标为交互式终端（`process.stdout.isTTY`）且未显式关闭时展示；
  - 若处于 CI 环境（`process.env.CI`）或配置了禁用环境变量（`NO_UPDATE_NOTIFIER=1` 或 `AGH_NO_UPDATE_NOTIFIER=1`），直接跳过。
- **本地 24 小时持久化缓存**：
  - 缓存路径优先使用 `os.tmpdir()/agh-console-update-cache.json`；
  - 缓存数据格式：`{ lastChecked: number, latestVersion: string }`；
  - 24 小时有效期内直接复用缓存结果，避免短时间内多次启停产生高频外网请求；
  - 文件读写增加全局异常捕获，若环境为只读文件系统或权限受限，静默降级为内存运行。
- **轻量终端字符画渲染**：
  - 无需引入庞大的三方 npm 依赖，内置原生 Unicode/ASCII 边框渲染函数；
  - 格式示意：
    ```text
    ┌─────────────────────────────────────────────────────────────┐
    │  Update available: 0.2.1 → 0.3.0                            │
    │  Run npm i -g agh-console or npx agh-console@latest to update │
    └─────────────────────────────────────────────────────────────┘
    ```

---

### 2. 升级脚本现代化 (`scripts/server-pull.sh`)
- **免 Token 公网拉取兼容**：
  - 鉴于仓库已完全公开，改写原有 `[ -f "$TOKEN_FILE" ] || exit 0` 强退出逻辑；
  - 优先通过静态下载链接获取 Release 资产与 `version.json`；若存在 `/etc/agh-console-github-token`，则附加 Bearer 头以规避 API 限流。
- **参数化与操作模式支持**：
  - 支持 `--check`：仅检查是否有新版，返回退出码（0: 已是最新，1: 发现新版）；
  - 支持 `--dry-run`：模拟拉取、解包与备份流程，不执行覆盖和 `systemctl restart`；
  - 支持 `--force`：跳过版本比对，强制覆盖安装并重启。
- **备份与状态记录保持**：
  - 升级前保留将原目录打包至 `/opt/agh-console.bak` 与 `.bak.prev` 的双重备份逻辑；
  - 升级成功后写入 `/var/lib/agh-console/deployed-tag` 并校验服务重启处于 active 状态。

---

### 3. 服务端自升级受控接口 (`server/upgrade.mjs`)
- **严格安全开关**：
  - 默认禁用。仅在显式声明环境变量 `AGH_ENABLE_SELF_UPGRADE=1` 或 `AGH_ENABLE_SELF_UPGRADE=true` 时激活；
  - 未启用时，升级相关接口统一响应 `403 Forbidden: Self-upgrade is disabled on this server`；
  - `GET /api/system/version` 中扩展返回字段 `canSelfUpgrade: boolean`。
- **接口设计**：
  - `POST /api/system/upgrade`：
    - 防重入状态锁：若已有升级任务进行中，返回 `409 Conflict: Upgrade is already in progress`；
    - 执行脚本：由 `child_process.spawn` 异步调起升级脚本（可通过 `AGH_UPGRADE_SCRIPT` 配置路径，默认指向 `/opt/agh-console/scripts/server-pull.sh` 或本仓脚本）；
    - 异步落盘执行日志：将输出流写入临时日志文件以备排查；
    - 响应返回 `{ ok: true, status: 'started', message: 'Upgrade process spawned' }`。
  - `GET /api/system/upgrade/status`：
    - 返回当前状态机状态：`idle` | `running` | `failed` | `completed` 及最新执行日志片段。

---

### 4. 前端一键更新与服务重启重连闭环
- **UI 呈现扩展 (`AppUpdateSheet.tsx`)**：
  - 当 `latest` 存在且 `canSelfUpgrade === true` 时，在操作区展示高亮按钮「一键升级并重启」；
  - 点击弹出确认二次弹窗，告知用户「服务端将自动拉取最新构建并重启 systemd 守护进程，期间网络访问会短暂中断几秒」；
  - 确认后发送 `POST /api/system/upgrade`。
- **前端自动轮询重连**：
  - 发送升级命令后，UI 进入更新中 Loading 遮罩界面；
  - 前端以 2 秒为间隔循环轮询 `GET /api/health`；
  - 一旦捕获到服务断开（502 / Connection Refused）后重新恢复 200 OK，判定重启成功；
  - 页面自动展示「已成功升级至最新版本」全局 Toast，并自动刷新页面载入全新静态资源。

---

## Accept

- [x] **CLI 启动横幅**：
  - [x] 终端以 TTY 模式启动 `server/index.mjs` 时，能在后台完成版本对比并在有新版本时打印格式化横幅；
  - [x] 24 小时本地缓存机制生效，重复启动不触发网络查询；
  - [x] 环境变量 `NO_UPDATE_NOTIFIER=1` 或非 TTY 环境下静默不输出；
  - [x] 具备单元测试覆盖检测逻辑、缓存读写与格式化输出。
- [x] **升级脚本现代化**：
  - [x] `scripts/server-pull.sh` 在缺少 Token 文件时仍能正常匿名拉取公开 Release 产物；
  - [x] 支持 `--check` 与 `--dry-run` 模式，具备容错机制。
- [x] **服务端自升级接口**：
  - [x] 默认状态下 `canSelfUpgrade` 为 `false`，调用 `POST /api/system/upgrade` 响应 403；
  - [x] 配置 `AGH_ENABLE_SELF_UPGRADE=1` 后接口激活，成功派发任务并具备 409 防并发冲突保护；
  - [x] 具备完备的单元测试，覆盖安全校验、状态流转与命令调度。
- [x] **前端一键更新与重连**：
  - [x] `AppUpdateSheet.tsx` 根据 `canSelfUpgrade` 动态切换操作按钮；
  - [x] 确认升级后进入轮询状态，成功监测服务重启并在恢复后提示刷新；
  - [x] 中英双语词条完备。
- [x] **工程门禁**：
  - [x] `pnpm check` 与 `pnpm test` 保持全绿；
  - [x] `npm run test:server` 全部通过；
  - [x] `node scripts/verify-proposals.mjs --links` 校验通过。
