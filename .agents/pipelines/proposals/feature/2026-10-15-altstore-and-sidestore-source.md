# 支持 AltStore 与 SideStore 社区源规范及桌面端自动更新蓝图

**Class:** feature
**Status:** implemented
**Date:** 2026-10-15
**Source:** 基于 [多渠道分发的检查更新与自动更新路线图](2026-10-15-update-check-and-distribution-roadmap.md)，推进阶段三「移动端侧载生态接入与桌面端未来准备」落地
**Updated:** 2026-10-16

## Goal

在阶段一（统一 Manifest 资产发布、服务端版本探测代理与前端检查更新闭环）和阶段二（CLI 终端非阻塞启动横幅、Linux 裸机/systemd 环境安全一键升级）相继交付后，阶段三聚焦于**移动端 iOS 侧载生态接入**与**桌面端更新架构准备**：

1. **解决 iOS 侧载更新断层**：
   iOS 自签用户（使用 AltStore 或 SideStore）以往每次更新都需要手动访问 GitHub Releases、下载未签名的 `agh-console.ipa`，再通过电脑或本地重签工具覆盖安装，不仅流程繁琐，且无法在应用更新时获得系统级通知。
2. **规范化 AltStore / SideStore 社区源规范**：
   AltStore 与 SideStore 均遵循统一的 Repository Source JSON 协议。通过在仓库和发布清单中维护标准化的 `community-source.json`，用户只需在手机侧载应用内添加一次源，后续发布新版时 AltStore / SideStore 即可自动感知、提示更新并在后台直接重签下载。
3. **闭环前端与多端分发体验**：
   在前端更新详情弹窗中为 iOS 运行时提供完整的专属操作：一键调起安装（`altstore://install?url=...`）、一键添加订阅源（`altstore://source?url=...` 与 `sidestore://source?url=...`）、一键复制源地址，并辅以直观说明。
4. **梳理桌面端（Tauri 2）自动更新蓝图**：
   为后续交付 Windows / macOS 独立客户端预备清晰的官方 `@tauri-apps/plugin-updater` 架构方案，包括公私钥签名、更新清单格式与原地覆盖重启流程。

---

## Decision

### 1. AltStore / SideStore 社区源规范实现 (`community-source.json`)

采用 AltStore 2.0 / SideStore 官方标准的 Source Schema：

```json
{
  "name": "AGH Console Community Source",
  "identifier": "com.cowjiang.aghconsole.source",
  "sourceURL": "https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/community-source.json",
  "subtitle": "AdGuard Home Mobile Management Console",
  "description": "Official community distribution source for AGH Console iOS app, compatible with AltStore and SideStore.",
  "iconURL": "https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/src-tauri/icons/icon.png",
  "website": "https://github.com/Cowjiang/adguard-home-console",
  "apps": [
    {
      "name": "AGH Console",
      "bundleIdentifier": "com.cowjiang.aghconsole",
      "developerName": "Cowjiang",
      "subtitle": "Mobile console for AdGuard Home",
      "localizedDescription": "A sleek, responsive mobile-first console for AdGuard Home instances with real-time statistics, client management, DNS rewrite rules, and multi-instance sync.",
      "iconURL": "https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/src-tauri/icons/icon.png",
      "tintColor": "10b981",
      "category": "utilities",
      "versions": [
        {
          "version": "0.2.1",
          "date": "2026-10-15T16:00:00Z",
          "downloadURL": "https://github.com/Cowjiang/adguard-home-console/releases/download/v0.2.1/agh-console.ipa",
          "size": 15485760,
          "minOSVersion": "15.0",
          "localizedDescription": "Release notes..."
        }
      ],
      "appPermissions": {
        "entitlements": [],
        "privacy": {}
      }
    }
  ],
  "news": []
}
```

- **持久化与更新幂等性**：`versions` 列表按发布时间倒序排列（最新版本在前），保留最近 10 个历史版本；重复执行相同版本时进行原地属性更新（Upsert），不产生冗余版本项。
- **精确大小测定**：构建脚本支持根据编译生成的 `agh-console.ipa` 实时读取 `stat.size` 字节数写入源清单；在无本地文件时优雅回退到合理估计值。

---

### 2. 生成脚本与自测体系 (`scripts/generate-altstore-source.mjs`)

新建无第三方依赖的标准 ES 模块脚本：
- **CLI 参数支持**：`--version`、`--tag`、`--date`、`--notes`、`--ipa-url`、`--ipa-file`、`--size`、`--min-os`、`--repo`、`--output`、`--source-file` 等。
- **Schema 严格校验**：`validateAltStoreSource` 对源名、唯一标识符、HTTPS 协议要求、App 属性以及各 Version 项的 semver 格式、时间戳、直链与正整数大小执行完整前置断言。
- **内置 `--self-test`**：集成进 `package.json` 的 `pnpm run test:release` 门禁，确保 CI 在执行发布前通过自测。

---

### 3. CI 发布流水线集成 (`.github/workflows/release.yml`)

在 GitHub Actions 的 `release` job 中形成双重闭环：
1. **基础源生成与发布**：
   在创建 Release 时，通过 `scripts/generate-altstore-source.mjs` 产出 `community-source.json` 并作为 Release 附件一同上传。用户既可通过 GitHub Releases 静态直链订阅（`https://github.com/Cowjiang/adguard-home-console/releases/latest/download/community-source.json`），也可通过 main 分支的 raw 链接订阅（`https://raw.githubusercontent.com/Cowjiang/adguard-home-console/main/community-source.json`）。
2. **精确 IPA 大小重写**：
   当 macOS 构建任务（`ios` job）成功产出未签名 IPA 时，下载该 IPA 并以实际测量到的字节大小重新调用生成脚本更新 `community-source.json`，通过 `gh release upload --clobber` 覆盖发布资产。

---

### 4. 服务端本地承载与前端 UI 交互 (`server/index.mjs` & `AppUpdateSheet.tsx`)

1. **服务端 CORS 静态端点**：
   在 Express 服务端暴露 `GET /community-source.json`，支持 `Access-Control-Allow-Origin: *`。无论是独立运行还是 Docker/反代部署，均可作为局域网或内网自建的 AltStore 源服务器。
2. **前端 iOS 专属侧载面板**：
   在 `AppUpdateSheet.tsx` 中针对 `runtime === 'ios'` 呈现：
   - **快捷安装**：一键调用 `altstore://install?url=...` 快速重签安装；
   - **源订阅快捷入口**：提供 `altstore://source?url=...` 与 `sidestore://source?url=...` 两个原生 URL Scheme 按钮，点击即可唤起对应应用弹出「添加社区源」确认弹窗；
   - **一键复制源地址**：提供展示源直链的复制框与对勾反馈，方便用户手动粘贴；
   - **中英双语国际化支持**：在 `zh` 与 `en` 字典中完整配置对应文案。

---

### 5. Tauri 2 桌面端自动更新准备（未来架构蓝图）

若后续向桌面端（Windows / macOS / Linux）交付基于 Tauri 2 的本地 GUI 应用，遵循以下标准实践：
1. **官方插件依赖**：引入 `@tauri-apps/plugin-updater`。
2. **更新验签公钥**：通过 `tauri signer generate` 生成公私钥对，公钥写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，私钥保管在 GitHub Actions Secret 中。
3. **桌面端更新清单（`desktop-update.json`）格式**：
   ```json
   {
     "version": "0.3.0",
     "notes": "Changelog text...",
     "pub_date": "2026-10-16T00:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "...",
         "url": "https://github.com/.../agh-console_aarch64.app.tar.gz"
       },
       "windows-x86_64": {
         "signature": "...",
         "url": "https://github.com/.../agh-console_x64-setup.nsis.zip"
       }
     }
   }
   ```
4. **应用内调用闭环**：通过 `import { check } from '@tauri-apps/plugin-updater'` 执行 `const update = await check(); if (update) await update.downloadAndInstall();` 实现静默下载与就地重启。

---

## Accept

- [x] 在仓库根目录及 `public/` 目录下维护规范的 `community-source.json`，且通过 AltStore/SideStore 架构校验。
- [x] 提供 `scripts/generate-altstore-source.mjs`，支持参数化构建、版本历史维护、大小测量与 `--self-test` 单元测试。
- [x] `package.json` 中的 `test:release` 门禁集成 AltStore 源生成自测并执行通过。
- [x] 在 `.github/workflows/release.yml` 中实现 `community-source.json` 的自动化生成与附件上传。
- [x] 服务端 `server/index.mjs` 暴露支持跨域访问的 `/community-source.json` 静态服务接口，并通过针对性测试验证。
- [x] 前端 `AppUpdateSheet.tsx` 针对 iOS 环境增加 AltStore/SideStore 社区源订阅、一键调起与复制交互，提供双语 i18n 支持。
- [x] TypeScript 类型检查与全套测试（Vitest + Server Node Tests）100% 保持通过。
