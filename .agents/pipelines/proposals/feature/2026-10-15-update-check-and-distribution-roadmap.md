# 多渠道分发的检查更新与自动更新路线图（Distribution Update Check & Auto-Update Roadmap）

**Class:** feature
**Status:** proposed
**Date:** 2026-10-15
**Source:** 用户要求「调研当前分发的检查更新和自动更新的方式，并先建立 roadmap 本地提案」

## Goal

`agh-console` 目前已经支持 4 条独立的分发流水线（Docker 镜像、npm/npx 包、Linux 独立 Tarball、iOS 未签名 IPA）以及 Web SPA / PWA。但当前应用内存在以下更新断层：

1. **应用对自身版本完全盲目**：前端 `SystemSettings.tsx` 中的「版本」检查仅调用了 AdGuard Home 目标实例的 `/version.json`（更新的是 AGH 自身）；`AboutSettings.tsx` 仅静态显示构建期注入的 `APP_VERSION`，用户无法得知 Console 是否有新版可用。
2. **缺乏统一的轻量级版本发布元数据清单**：各端如果直接高频调用 GitHub Releases API，极易受未鉴权 IP 每小时 60 次的 Rate Limit 阻断（403 错误）。
3. **各端自动更新能力割裂**：仅有服务端预置了基于 systemd timer 的 `scripts/server-pull.sh`，Docker、npm 以及 iOS 均缺乏原生的更新感知或引导方案。

**目标**：建立一套适用于多渠道分发的轻量级版本检测与更新路线图，统一版本清单源，在前端 UI 闭环「版本检测 + 差异化更新指引」，并分阶段完善各端（Docker / npm / Linux / iOS）的自动化与自更体验。

## Decision

整体分为三个阶段推进：

### 阶段一：统一版本清单（Manifest）与前端感知闭环（P0）

1. **版本元数据源（Release Manifest）**
   - CI 流水线（`.github/workflows/release.yml`）在 `prepare` 或 `build` 阶段生成 `version.json`，随 GitHub Release 资产一同发布，也可通过 CDN 加速访问。
   - `version.json` 包含：最新正式版版本号、nightly 动态版本、发布时间、各渠道下载链接（tarball / ipa / docker / npm）及简要 release notes。
   - 客户端（Web/iOS）或服务端仅拉取该轻量 JSON，避免触发 GitHub API 速率限制。
2. **服务端环境探测与版本代理 API**
   - Express 服务端（`server/index.mjs`）新增 `/api/system/version` 接口，输出：
     - `currentVersion`: 当前运行版本；
     - `channel`: 渠道识别（`stable` / `nightly`）；
     - `runtime`: 宿主环境推断（`docker` / `npm` / `systemd` / `standalone`）；
     - `latestVersion`: 远程最新版本信息（服务端维持 12 小时本地内存/文件缓存，防止反复请求）。
3. **前端 UI 交互补齐**
   - 在 `AboutSettings.tsx` 增加「检查更新」按钮与最新版本状态 Badge（「已是最新」/「发现新版本 vX.Y.Z」）。
   - 增加「更新详情」弹窗 / Sheet，渲染更新日志，并根据检测到的 `runtime` 给出差异化升级指引：
     - **Docker**：展示推荐的升级命令（如 `docker compose pull && docker compose up -d`）。
     - **npm**：展示 `npm install -g agh-console@latest`。
     - **Linux 独立部署**：展示更新说明或脚本触发按钮。
     - **iOS**：展示「下载最新 IPA」链接及「通过 AltStore/SideStore 打开」Scheme 跳转。
   - 在概览页或设置入口增加轻量级无感红点提示（非强阻塞弹窗）。

---

### 阶段二：CLI 启动横幅与服务端半自动更新（P1）

1. **npm / npx 启动更新提示**
   - 在 `server/index.mjs` 中集成非阻塞的轻量更新探测（启动时异步查询 npm registry 或 `version.json`，带本地 24h 缓存）。
   - 若检测到全局安装或 npx 运行在老版本上，在控制台打印友好的升级提示框。
2. **Linux 独立部署（Tarball + Systemd）的 Web 触发升级**
   - 复用现有的 `scripts/server-pull.sh`。
   - 在服务端满足特定权限或配置开关时，允许在前端设置中点击「立即更新」，服务端异步调用更新脚本、记录日志并重启 systemd 单元。

---

### 阶段三：移动端侧载生态接入（P2）

1. **AltStore / SideStore 社区源规范**
   - 针对 iOS 自签用户，在仓库或 GitHub Pages 维护一份 `community-source.json`。
   - 用户只需在 AltStore / SideStore 中添加一次该源，后续新版发布后即可在手机端收到通知并一键在后台更新重签。
2. **Tauri 桌面端未来准备**
   - 若后续交付 Windows / macOS 桌面壳，遵循 Tauri 2 官方架构引入 `@tauri-apps/plugin-updater`，通过公钥验签实现无缝下载与原地覆盖更新。

## Accept

- [x] **阶段一验收**：
  - [x] CI 流水线发布时产出并上传 `version.json` 资产。
  - [x] 服务端暴露 `/api/system/version`，支持当前版本与最新版本比对，且具备缓存防刷能力。
  - [x] 前端「关于」页面新增「检查更新」操作项，能正确识别当前是否为最新版本，展示更新日志及对应运行环境的更新指引。
  - [x] iOS 壳环境下能正确拉取检测并在发现新版本时唤起系统浏览器或快捷下载。
- [x] **阶段二验收**：
  - [x] npm 全局运行老版本时在终端输出更新提示，不阻塞服务启动。
  - [x] 裸机 Linux 部署环境下可通过安全受控的方式在 Web UI 触发版本更新。
- [ ] **阶段三验收**：
  - [ ] 发布可供 AltStore / SideStore 订阅的源 JSON 文件，完成真机侧载源刷新验证。
