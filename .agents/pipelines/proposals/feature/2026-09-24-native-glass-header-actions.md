# 把 iOS 壳的顶栏操作按钮改成原生液态玻璃

**Class:** feature
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户要求「阅读项目对原生液态玻璃返回按钮的实现，把右上角的按钮也用液态玻璃处理（仅苹果）；带颜色的按钮可以改成带颜色文字的液态玻璃按钮；图标按钮要保证观感一致；已改成液态玻璃的地方不要再显示自定义按钮以免穿帮」。

## Goal

iOS 壳里顶栏右侧的 7 处操作按钮（客户端/重写的「＋」、黑/白名单过滤器页的「更新」、设置四页的「保存」）此前都是 CSS 绘制的胶囊，与旁边的原生玻璃返回胶囊观感割裂：高度/形态靠手工对齐，且底部导航栏是原生玻璃、顶栏按钮却不是。本提案把它们交给 `tauri-plugin-system-components` 的原生按钮，并让原生层跟随应用主题。

## Decision

- **原生接管 + 不回退双按钮**：`src/lib/nativeHeaderAction.ts` 的 `useNativeHeaderAction(spec, onPress, enabled)` 在 `enabled && !isDesktop && isTauriIOS()` 时创建原生玻璃按钮（`anchor: topTrailing`、`dy: -8`、高度 44pt；图标按钮 44×44 对齐 CSS 圆形胶囊）。只要走原生路径，CSS 按钮就**永不显示**（`visibility:hidden` 只保留布局），仅在原生创建失败时回退；组件 id 固定 `nav-action`，用模块级 `owner` 令牌保证只有创建者能删。
- **彩色 = 玻璃 + 彩色内容**：插件新增 `foreground` 属性（内容色；原有 `tint` 是背景色）。演示：`＋` 用 `plus` + 主题强调色；`保存` 是玻璃胶囊 + 强调色文字（不再是绿底白字实心）；`更新` 是玻璃胶囊 + 刷新图标 + 中性文字。
- **出场不跟随滑动**：原生控件悬浮在 WebView 之上、不参与 CSS 平移，因此不做 `appearOffsetX` 跟随；改为**转场过半**（340ms 的 170ms 处）原地淡入、离开时过半再淡出（侧滑提交无 CSS 转场则立即）。转场层新增 `useTransitionHalfBusy()` / `TRANSITION_HALF_MS`。时长：淡入 0.22s、淡出 0.14s（插件入场时长改为可配置，默认 0.32 不变）。
- **返回胶囊同一策略**：手势期间不再让位给 CSS 胶囊（那正是用户看到的穿帮），而是**保持在场**——它正好落在被揭示页面的胶囊位置；快照克隆也不再补显任何自定义按钮。
- **原生层跟随应用主题**：新增插件命令 `set_appearance(style)`，`applyTheme` 解析出明暗后调用；Swift 侧在命令与每次 overlay 挂载时给 TabBar / 组件层 / 原生弹层设 `overrideUserInterfaceStyle`。
- **只对壳生效**：全部路径以 `isTauriIOS()` / `nativeBar` 门控；浏览器移动端与 Tauri 桌面/Android 行为不变（CSS 按钮照常）。

## Accept

- [x] 客户端、重写：原生玻璃圆钮 44×44，图标为强调色，与返回胶囊同形同高（模拟器截图核对）
- [x] 黑/白名单过滤器：原生玻璃胶囊 + 刷新图标 + 「更新」文字
- [x] 设置 DHCP（另三页同规格）：原生玻璃胶囊 + 强调色「保存」文字
- [x] 上述页面静止态只有原生按钮、无重复；CSS 按钮数在壳内为隐藏占位
- [x] 侧滑过程中不出现任何自定义按钮（逐帧截图：拖拽中导航条只剩标题随页滑动；取消后原生按钮淡入、标题栏居中）
- [x] 「添加静态租约」「添加过滤器」弹层正常（修复了 hook 依赖 Router 上下文导致弹层内 Button 崩溃的问题）
- [x] 原生层跟随应用主题：应用浅+系统深 → TabBar/胶囊/按钮皆浅；应用深+系统浅 → 皆深（截图核对）
- [x] 浏览器移动端不受影响：返回胶囊与操作按钮均 `visible`，DOM 内无 `data-native-hidden` / `.invisible` 元素（实测）
- [x] `npm run check`、`npm run build`、`cargo check` 通过；模拟器包重建安装

## Note

- 实现中发现并修掉的连带问题：① hook 调用 `useNavigationType()` 使弹层（Router 之外渲染）内任何 `Button` 崩溃；② 顶栏组件 id 共享，普通 `Button` 的 `clear()` 会误删同页原生按钮（`!enabled` 早退 + owner 令牌）；③ 手势用 `document.querySelector('[data-floating-nav]')` 命中了转场快照克隆（克隆带同一属性且在 `#root` 内、文档顺序更靠前），导致取消侧滑后真实导航条残留位移；④ iOS 26 的 glass 配置忽略 `baseForegroundColor`/`imageColorTransformer` 对符号图的着色（改用 `withTintColor(_:renderingMode:.alwaysOriginal)`）；⑤ Tauri v2 插件新命令未登记权限时 invoke 被静默拒绝（需改插件 `build.rs` 命令清单 + `permissions/default.toml`）；⑥ 退场延迟移除与新按钮创建竞态把刚建好的返回按钮删掉。
- 施工过程记录见 `.agents/logs/tauri-ios.md` §18；插件命令面与权限、顶栏交互约定分别更新到 `docs/architecture/tauri-shell.md` 与 `docs/web-interaction.md`，坑位记入 `docs/engineering.md`。
