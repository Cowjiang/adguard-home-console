# 为移动端增加下拉刷新并修复断网后的刷新冻结

**Class:** feature
**Status:** implemented
**Date:** 2026-09-25
**Source:** 用户反馈：断网恢复后首页不自动刷新，也没有手动刷新入口；方案方向经讨论确认为「下拉刷新 + 切换 tab 自动刷新 + 最小自愈层」，并要求不影响 iOS 侧滑返回的页面快照。

## Goal

断网（Wi-Fi 切换、服务重启、VPN 断连）恢复后页面停留在旧数据，无提示、无刷新手段。根因有三层：

1. SWR 轮询默认 `refreshWhenOffline: false`，且 SWR 的在线状态不读 `navigator.onLine`，只认 `offline`/`online` 窗口事件（swr@2.5.1 dist 内 `let online = true` 仅由事件翻转）。iOS WKWebView/PWA 里事件可能丢失，标志卡在 false 后所有恢复路径——轮询、focus/reconnect 重验证、错误重试（`use-swr` 内均以 `isActive() = isVisible() && isOnline()` 门控）——全部失效，页面永久冻结。
2. auth 的 `/status` 只在应用启动时探一次，TopBar「服务离线」与防护卡在恢复后冻结在旧状态。
3. 无手动刷新入口；iOS 壳与 PWA standalone 没有 reload 手势。

## Decision

按「用户触发刷新为主、最小自愈为底」分层，各层独立可用：

- **下拉刷新**（`src/lib/pullToRefresh.ts`）：复用边缘侧滑的手势框架（window 触摸监听 + 意图判定 + 非 passive `preventDefault` + transform 跟手），页面顶部垂直下拉过阈值松手后触发 `/status` 重探 + SWR 全局 `mutate`，未过阈值回弹。与侧滑的让位规则：触点在左缘 24px 条内让给侧滑、水平意图让路、转场（`useTransitionBusy`）/侧滑手势（`useGestureActive`）/刷新中不启用；只在 `window.scrollY <= 0` 时接管。body 已有 `overscroll-behavior-y: none`，浏览器原生下拉刷新（整页 reload）与橡皮筋已被压掉。内容位移挂在 Layout 的包裹层，指示器在 Layout 层渲染——都不在 `capturePage` 的克隆范围内，转场快照管线零改动。
- **tab 落地刷新**：SWR key 随 tab 切换重挂本就会无条件重验证（`revalidate()` 入口不检查在线状态），数据侧无需改动；真正缺的是 status——导航落地 tab 根页（`TAB_ROOT_ROUTES`）时调一次 `refreshStatus()`。
- **最小自愈层**：全局 `SWRConfig` 设 `refreshWhenOffline: true`（轮询不再被在线标志停摆）；AuthProvider 以 15s 低频重探 `/status`，外加 `visibilitychange`/`online` 即时探——事件在 WKWebView 不可靠，纯事件监听关不掉同一个洞；探测从失败恢复成功时全局 `mutate(() => true)` 一次，解救被冻住的 key 并让 TopBar/防护卡回到真实状态。15s 是恢复上界：事件可靠时（桌面浏览器）恢复仍即时。

iOS 侧滑快照不受影响的依据：下层快照是 push 时克隆的静态 DOM，本就容忍内容漂移（概览数据健康时每 5s 在变，落地重挂后自动追上）；其一致性硬要求是布局不漂（`PARALLAX = 0` 注释针对右缘控件错位），刷新只改数据不改布局。

## Accept

- [x] iOS 壳/移动浏览器页面顶部下拉：跟手位移、过阈值松手转圈至完成回弹，未过阈值直接回弹（代码实现；手感待用户验证）
- [ ] 下拉刷新后 stats/clients/Top 榜与 TopBar 状态条更新（待用户在 Mac 模拟器验证）
- [ ] 断网恢复：开页后断网数秒再恢复，不做任何操作，≤15s 内数据与状态条自行恢复（待用户验证）
- [ ] 切换 tab 回概览，数据与状态条刷新（待用户验证）
- [x] 下拉手势与边缘侧滑互不抢：左缘水平拖出侧滑、顶部垂直下拉出刷新，互不误触（代码路径互斥；手感待用户验证）
- [x] 桌面端（≥lg 或精指针设备）无下拉刷新，行为不变
- [x] `npm run check` / `npm run build` / `node scripts/verify-proposals.mjs --links` 通过；Rust 侧无改动

## Note

- 分支 `feat/refresh-triggers`（自 dev 切出），用户在 Mac 上复测。
- SWR 行为依据来自仓库安装的 swr@2.5.1 dist 源码：在线标志与事件监听在 `config-context-*.js`，轮询与重试门控在 `use-swr-*.js`；关键点：轮询 tick 还受 `!getCache().error` 短路，error 在缓存时轮询跳过，恢复依赖错误重试或外部 mutate。
