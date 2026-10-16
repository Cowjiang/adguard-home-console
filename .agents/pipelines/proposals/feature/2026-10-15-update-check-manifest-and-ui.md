# 阶段一：统一版本清单（Manifest）与应用内检查更新闭环

**Class:** feature
**Status:** implemented
**Date:** 2026-10-15
**Source:** 基于 [多渠道分发的检查更新与自动更新路线图](2026-10-15-update-check-and-distribution-roadmap.md)，推进阶段一「统一版本清单与应用内检查更新」的落地提案
**Updated:** 2026-10-15

## Goal

当前 `agh-console` 虽已支持 Docker、npm、Linux Tarball 与 iOS IPA 四种发布分发渠道，但控制台应用自身缺乏对新版本的感知能力：
1. `AboutSettings.tsx` 仅静态展示构建期注入的 `APP_VERSION`，无任何远程检测与比对能力。
2. 缺乏防限流、低延迟的轻量级发布清单，若前端直接调用 GitHub Releases API 会受到 60 次/小时的速率限制（403 错误）。
3. 用户在不同宿主环境（Docker 容器、npm CLI、Linux systemd 服务、iOS 侧载 IPA）下缺乏对症的升级指引。

**阶段一目标**：
在 CI 发布流水线中自动生成并上传结构化 `version.json` 清单；服务端提供带防刷缓存的环境推断与版本代理接口；前端「关于」页面完成「检查更新、状态反馈、更新日志呈现与差异化升级指引」的交互闭环。

---

## Decision

### 1. CI 发布清单生成（Manifest Generation）
在 `.github/workflows/release.yml` 的 `release` job 中，扩展生成并上传轻量级 `version.json` 资产：
- **静态资源直链优势**：该资产可通过 `https://github.com/Cowjiang/adguard-home-console/releases/latest/download/version.json`（或指定 tag 下载链接）直接访问，由 GitHub S3 静态直链承载，**完全不消耗 GitHub REST API 的每小时 60 次限流配额**。
- **清单结构规范（Schema 1.0）**：
  ```json
  {
    "schemaVersion": "1.0",
    "appName": "agh-console",
    "channel": "stable",
    "version": "0.2.1",
    "releaseTag": "v0.2.1",
    "publishedAt": "2026-10-15T16:00:00Z",
    "releaseNotes": "1. 优化...\n2. 修复...",
    "htmlUrl": "https://github.com/Cowjiang/adguard-home-console/releases/tag/v0.2.1",
    "downloads": {
      "tarball": "https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.tar.gz",
      "ipa": "https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.ipa",
      "docker": "ghcr.io/cowjiang/agh-console:0.2.1",
      "npm": "agh-console@0.2.1"
    }
  }
  ```
- **双渠道匹配**：stable 渠道输出最新稳定版资产与 tag；nightly 渠道输出当前滚动 nightly 的版本及资产引用。

---

### 2. 服务端版本接口与环境推断（Server Proxy & Runtime Detection）
在 Express 服务端（`server/index.mjs`）暴露 `GET /api/system/version` 接口：
1. **宿主环境识别（`runtime`）**：
   - `docker`：通过环境变量 `AGH_RUNTIME=docker`（写入 `Dockerfile`）或检测容器特征文件判别；
   - `systemd`：检测环境变量 `INVOCATION_ID`（systemd 默认注入）或存在守护进程配置文件；
   - `npm`：检测执行路径或包管理器环境变量；
   - `standalone`：裸 Node 进程本地运行（默认 fallback）。
2. **防刷缓存与优雅降级（Cache & Resilience）**：
   - 服务端在内存中维持 12 小时的远程检测缓存（`cachedManifest` + `cachedAt`）；
   - 支持 `GET /api/system/version?force=1` 供用户在 UI 手动点击「检查更新」时穿透缓存；
   - 网络请求设置 5 秒超时保护（`AbortSignal.timeout(5000)`）；
   - 离线或上游异常时，不抛 HTTP 500，返回 `{ ok: true, currentVersion, runtime, checkFailed: true, error: "..." }`，确保服务稳定。
3. **环境可配置上游**：
   - 允许通过环境变量 `AGH_UPDATE_URL` 自定义清单地址（便于企业内网镜像源或 CDN 加速源代理）。

---

### 3. iOS 壳与移动端适配（Tauri Shell Adaptation）
- 在 Tauri iOS 壳中（无本地 Express 运行），前端利用 `isTauriShell()` 判定：
  - 由前端直接请求远端 `version.json`（静态直链在移动端 WebKit 环境下无 CORS 跨域问题）；
  - 将环境标识固定识别为 `ios`；
  - 发现新版时，除了提供 IPA 直接下载，还提供基于 Scheme 的第三方快捷跳转，例如：
    `altstore://install?url=<ipa_encoded_url>` 或 `sidestore://install?url=<ipa_encoded_url>`。

---

### 4. 前端交互与视觉闭环（UI & Interaction）
1. **关于页（`AboutSettings.tsx`）增强**：
   - 在版本展示行右侧或下方增加状态指示（如「已是最新」/「发现新版本 vX.Y.Z」Badge）；
   - 增加「检查更新」操作项，带加载状态 Spinner；
   - 若当前已是最新版，触发轻量级成功 Toast（`settings.appUpToDate`）；
   - 若检测失败，轻量提示错误并允许重试。
2. **更新详情弹窗（`AppUpdateSheet.tsx`）**：
   - 检测到新版本时展开详情 Sheet：
     - 展示新版本号、发布日期与 Release Notes；
     - 根据不同宿主环境展示差异化操作区：
       - **Docker**：展示 `docker compose pull && docker compose up -d` 命令并提供「一键复制」按钮；
       - **npm**：展示 `npm i -g agh-console@latest`；
       - **Linux 部署**：展示更新说明及 Tarball 归档下载按钮；
       - **iOS**：展示「下载 IPA」和「通过 AltStore 打开」两个快捷入口。
3. **多语言支持**：
   - 在 `src/lib/i18n/locales/zh/settings.ts` 与 `en/settings.ts` 补齐对应中英文案。

---

## Accept

- [x] **CI 与清单发布**：
  - [x] 发布脚本生成符合规范的 `version.json`，并通过 `release.yml` 随 Release 资产一同上传；
  - [x] GitHub 静态下载链接直通可用，免除 API 限流。
- [x] **服务端接口与环境检测**：
  - [x] `GET /api/system/version` 正常返回 `currentVersion`、`channel`、`runtime` 及 `latest` 信息；
  - [x] 服务端 12 小时防刷缓存生效，`force=1` 时穿透缓存；
  - [x] 断网或上游超时 5 秒内优雅降级，返回 `checkFailed: true` 且不报错中断。
- [x] **前端关于页与更新详情交互**：
  - [x] `AboutSettings.tsx` 接入检查更新功能，展示最新版本状态 Badge；
  - [x] 发现新版时成功打开 `AppUpdateSheet`，正确渲染 Release Notes；
  - [x] 对应不同环境（Docker / npm / iOS / standalone）准确展示对应升级指引与快捷复制/跳转操作；
  - [x] 中英双语词条完备。
- [x] **全量工程门禁**：
  - [x] `pnpm check` 与 `pnpm test` 保持全绿；
  - [x] `node scripts/verify-proposals.mjs --links` 校验通过。
