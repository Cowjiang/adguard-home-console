# Web/PWA 侧滑返回揭示空白：收掉浏览器原生手势

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-16
**Source:** 用户实测反馈「Safari 的 PWA 里在设置页的子页面左滑返回时，上级页面快照变成空白；iOS App 无此问题」。

## Goal

PWA（手机浏览器/添加到主屏）里左滑返回时，揭示的上级页面是一片空白。App 里的自研侧滑不受影响，也不能被这次改动影响。

## Root cause

- PWA 里 `isTauriIOS()` 为 false，自研边缘侧滑不启用，左滑由 **Safari 自己的系统手势**接管。
- 该手势在滑动中「揭示」的那一层是 **WebKit 自己绘制的快照层**：同文档（pushState）历史条目 WebKit 从未截过图（截图只在跨文档导航离开文档时才生成），于是那一层是空白底板，而且它在页面文档之外——页面怎么写都画不进去。这条结论在 iOS 壳上已逐帧取证过（`.agents/logs/tauri-ios.md` §13.2，采样 `#E3E5EC` ≠ 页面底色），壳的处理方式就是关掉原生手势、改自研（8d97ede）。浏览器里没有 `allowsBackForwardNavigationGestures` 这样的开关，所以 Web 侧一直留着这个缺口。
- 用户观察到的页面差异（设置子页明显、客户端/日志子页没注意）：设置页里可测的入口（系统管理/配置快照/实例管理）都在首屏以下，进子页前一定滚动过；客户端与日志列表从顶部第一行就能点。空白与滚动无关，但「先滚动、再点、再滑」的路径让设置子页更容易被撞上。

## Decision

Web/浏览器壳里把原生侧滑收掉，返回走应用内返回胶囊（胶囊的 CSS 退场/进场层用的是我们自己捕获的快照，正确）：

```css
html:not([data-tauri-shell]) body { overscroll-behavior-x: none; }
```

- `data-tauri-shell` 由 `src/main.tsx` 依据 `isTauriShell()`（`window.__TAURI_INTERNALS__`）打在 `<html>` 上，**iOS App 与桌面壳完全不命中这条规则**——用户明确要求不影响 App，这一条是硬约束的落点。
- 与既有 `overscroll-behavior-y: none`（压掉浏览器原生下拉刷新，见 `docs/web-interaction.md`）同源：浏览器原生行为与自研交互冲突时，从 CSS 侧收掉原生那条。
- 不把自研手势搬到浏览器：iOS Safari 的边缘手势是原生识别器，页面无法取消，双层手势会同时平移页面、松手还可能各提交一次返回（历史栈一次退两格）。要做只能在真机上验证，本次不动。

## Accept

- [x] 代码门控可核：`data-tauri-shell` 只在 `isTauriShell()` 为真时写入；浏览器页面（无 `__TAURI_INTERNALS__`）命中 `overscroll-behavior-x: none`，壳伪装页（注入 `__TAURI_INTERNALS__`）不命中，两条都在 Chromium 探针里用 `getComputedStyle` 核对过。
- [x] `pnpm check` / `pnpm build` 通过（`pnpm test` 无相关改动，见 CI）。
- [ ] 真机确认（待用户）：PWA 里左滑不再出现空白揭示层（手势被收掉后应表现为「不触发」，返回用左上角胶囊）。

## Note

- 这是「把 WebKit 画不好的一层收掉」，不是让它变正确：PWA 里没有边缘侧滑返回了。若要在 PWA 保留滑动手感，只能把自研侧滑移植到浏览器壳并处理与系统手势的互斥，需要真机验证。
- 与同日 `bug-fix/2026-10-16-swipe-underlay-enter-class.md` 的关系：那条修的是 App 自研侧滑下层的克隆洁净（快照重播入场动画导致空白/错位），这条修的是浏览器原生手势本身揭不出内容；两者互不依赖。
- 桌面浏览器同规则生效：横向 overscroll 触发的返回导航（Chrome）一并收掉，无副作用。
