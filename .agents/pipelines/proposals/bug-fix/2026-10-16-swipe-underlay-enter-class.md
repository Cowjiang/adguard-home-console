# 侧滑下层快照重播入场动画：父页快照空白/错位

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-16
**Source:** 用户实测反馈「移动端在设置页的子页面左滑返回时，上级页面快照会变成空白；客户端页、日志页的子页面没这个问题」。

## Goal

设置子页左滑返回时，被揭示的上级页整片空白（或整体错位），而客户端/日志子页正常。现象是同一机制的两种表现，本次修掉快照克隆里的动画残留，并把文档里已经过期的侧滑实现描述改回事实。

## Root cause

- `capturePage` 的克隆洁净只作用于**子孙**节点（`querySelectorAll('.page-in,…')`），**根节点**——TransitionArea 的页面容器——没有处理。而转场进行中，入场动画类恰好就挂在根节点上（`className={enterAnim ? …}`），窗口为 `DURATION_MS + 50 = 390ms`。
- 克隆经 `attachNode` 重新插入 DOM 时会**重播** CSS 动画；`rt-push-in` 首帧是 `translate(100%)`（整层在视窗外）、`rt-pop-in` 是 -28%、`page-in` 是 opacity 0。于是侧滑下层（`underlays`）与退场层（`exit`）里的旧页快照从视窗外/透明处开始播放：揭示区整片空白（iOS 手势期间动画还可能挂起不启动，同 70cc1e2 的结论，则整个手势期间都空白）或整体错位。
- 触发条件是**两次导航间隔 < 390ms**：进入某页后立刻再下钻，第二次导航的捕获就带上第一次的入场类。设置页各组是静态行，点开即用、可以马上再点（实例管理 → 实例编辑最典型）；客户端与日志列表要等 SWR 出内容，点击天然慢一拍——这解释了用户观察到的页面差异，也解释了为什么「正常间隔」的手工流程复现不出来。
- 复现证据（Chromium 探针）：让页面容器带 `rt-push-in` 后触发下钻，下层克隆根节点 `class="rt-push-in rt-page-bg"`、`transform=matrix(1,0,0,1,76.6,0)`、`rect.left=77`，revealed 区空白/错位；真实快速下钻流程（设置 → 实例管理 → 120ms → 实例编辑 → 左滑）同样复现。

## Decision

快照洁净收敛为 `sanitizeSnapshot(node)`：根节点与全部子孙一起摘掉 10 个一次性动画类（`page-in`、`content-in`、`tab-in`、`rise-in`、`log-flash`、`rt-push-in`、`rt-push-out`、`rt-pop-in`、`rt-pop-out`、`rt-pill-in`），并清空根节点的内联 `transform`/`animation`/`transition`（处于拖拽中的 transform 不得被打进快照）。三处克隆（页面容器、悬浮导航条、状态 pill）统一走它，替换原先分散、且只覆盖子孙的摘除。

不动手势与转场时序：`onStart` 已用 `busy` 挡住转场期间起手，所以不存在「拖拽撞上入场动画」的活体冲突，残留只可能出现在**捕获**侧。

## Accept

- [x] 复现：Chromium 探针（`_probe/` 本地材料，伪装 iOS 壳环境 + 注入触摸）在快速下钻后左滑——旧快照根节点带入场类、transform +77px、揭示区空白。
- [x] 修复后同一场景：根节点无动画类、`transform: none`、`left: 0`，父页（实例列表）完整显示；Chromium 与 Playwright-WebKit 结果一致。
- [x] 回归：设置页 8 个子页（常规/DNS/加密/快照/系统/外观/实例管理/关于）逐个下钻后左滑，下层内容与位置正常；WebKit 下「滚动后再进子页」的既有用例同样正常。
- [x] `pnpm check` / `pnpm test`（93 passed）/ `pnpm build` 通过。
- [ ] 真机（iOS 壳）按用户原始路径复测（待用户确认环境与复现步骤）。

## Note

- 验证工具全部在本地 `_probe/`（不入库）：`__probe.html` 在模块加载前注入 `__TAURI_INTERNALS__` 与 Apple Mobile UA/vendor，使 `isTauriIOS()` 为真，再用合成 `TouchEvent` 注入边缘拖拽；WebKit 走 `_probe/pw/` 的 Playwright-WebKit 脚本（Chromium 与 WebKit 双引擎对照）。
- `docs/web-interaction.md` 中「WKWebView 侧滑返回使用原生历史快照」是 8d97ede 之前的旧事实，本次一并更正为「自研手势 + Rust 侧关闭 `allowsBackForwardNavigationGestures`」，并补上快照洁净规则。
- 同族隐患（本次未改）：拖拽进行中发生程序化导航时手势状态不会被清理，容器可能残留 transform；触发条件苛刻（需要另一次程序化导航打断拖拽），留待有复现再处理。
