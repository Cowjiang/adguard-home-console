# 交付 Windows 桌面壳的本地打包路径，并把桌面视口钉在桌面布局宽度

**Class:** feature
**Status:** implemented
**Date:** 2026-10-18
**Updated:** 2026-10-18（实施完成：窗口尺寸改 1280×800 / 最小 1024，重打包并完成安装级验收）
**Source:** 用户要求「开新分支打包成 Windows 应用」，并要求「电脑端视口至少应该跟桌面端 web 最小宽度一样，不采用移动端布局」

## Goal

`src-tauri/` 里 Tauri 2 桌面壳的 Rust 侧（`agh_fetch` 代理、内嵌 `dist/`）一直齐备，但仓库从未产出过 Windows 产物：`release.yml` 只有 web/npm/docker 与 iOS 两条线，`docs/native-platforms.md` 记的是「Windows / Android / macOS 桌面壳尚未交付」。

本次要打通并验收本机 Windows 打包路径，同时修掉桌面壳的开局口径问题：`tauri.conf.json` 的窗口默认 960×640 落在桌面布局断点（`useIsDesktop` 的 `min-width: 1024px`）之下，双击打开得到的是移动布局——底部悬浮标签栏 + 单列卡片，对桌面端是不可接受的初始形态。

## Decision

- 桌面窗口尺寸按桌面布局钉住：`width: 1280` / `height: 800` / `minWidth: 1024` / `minHeight: 600`。`minWidth` 直接取桌面断点 1024，桌面壳在任何可调尺寸下都不进入移动布局。
- 移动布局保留给浏览器窄窗口与移动端（`useIsDesktop` 与 Tailwind `lg:` 都不动）；桌面壳只是不再落进那一档。
- 本次不为 Windows 单开 CI job：产物在本机验证，发行渠道维持现状（web tarball / npm / 镜像 / iOS ipa）。

## Accept

- [x] `pnpm tauri build`（`x86_64-pc-windows-msvc`）产出 MSI `AGH Console_0.2.1_x64_en-US.msi`（4.2 MiB）与 NSIS `AGH Console_0.2.1_x64-setup.exe`（3.0 MiB）
- [x] 打包产物启动后默认视口 1280×800（`innerWidth` 实测），`matchMedia('(min-width: 1024px)')` 为真、无移动底部标签栏、导航为左侧栏五项的桌面形态
- [x] 最小宽度钳制到桌面断点：向窗口查询 `WM_GETMINMAXINFO` 得 `ptMinTrackSize = 1040×639`（外框；减 16px 边框 = 1024 内宽），拖动下限即桌面布局边界
- [x] 概览 / 过滤器 / 日志 / 客户端 / 设置五页经 Rust `agh_fetch` 代理连 mock AGH 后均正常渲染，无控制台错误、无失败请求、无横向溢出；唯一 error 是检查更新拉 GitHub 清单被 CORS 拦——清单资产本身缺失（发行线只从 `main` 上的 `release.yml` 产出）导致的 404 页面没有 CORS 头，与桌面壳无关
- [x] 主题跟随 Windows 应用主题：本机为深色时 `prefers-color-scheme: dark`、`data-theme=dark`，真实窗口呈现深色
- [x] NSIS 包静默安装 → 启动（仍是 1280×800 桌面布局）→ 静默卸载，安装目录、卸载表项与开始菜单项均清理干净
- [x] `pnpm check`、`pnpm test`（128 passed）、`pnpm build`、`node scripts/verify-proposals.mjs` 通过

## Note

- 验收走 WebView2 远程调试端口（`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`）接 Playwright，验的是**打包后的 release 二进制**而不是 dev server；安装级验收用同一套探针复测。
- 经 CDP 接管时须显式 `emulateMedia({ colorScheme: null })`：Playwright 默认把 `prefers-color-scheme` 模拟成 light，不关掉会把真实窗口（跟随系统深色）与页面读数判成互相矛盾。
- 本机证据（本地留存，不入库）：`_probe/pw/win-app-probe.mjs`、`win-app-tour.mjs`、`win-verify.mjs`、`_probe/win/capture-window.ps1`、`probe-min.ps1`、`_probe/out/win2/*.png`。
- 独立视觉复核（子 agent，看 1280×800 五页截图）五页均 pass，仅四条低优先级观感项：概览 hero 卡与统计磁贴等高导致下方留白、趋势/拦截图右端有一道浅色带与虚线边界、客户端表头有一列只有图标、设置页小节标题比卡片左缘内缩约 20px。均属既有设计细节，不在本次范围。
- 未签名是既定取舍：没有 `bundle.windows` 的签名配置，安装时会有 SmartScreen 提示；要给 Windows 加签名/更新器需另立提案。
- 附带的既有观察（不在本次范围）：桌面左侧栏的品牌锁定写死为「AdGuard Home / Console」，与 `README.md` 记的「应用名是 AGH Console、AdGuard Home Console 是仓库项目名」不一致，且与登录页使用的 `APP_NAME` 不同源。
