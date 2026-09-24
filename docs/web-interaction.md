# Web 端布局与交互约定

**Status:** current
**Updated:** 2026-09-25

## 视觉与响应式结构

- 移动端为四个 Tab：`/` 概览、`/protection` 过滤器、`/log` 日志、`/settings` 设置。`/protection` 保留旧 URL，客户端由概览入口进入。
- 桌面以 `lg`（1024px）为布局分界，使用 240px 侧边栏；统计 `/stats` 和客户端 `/clients` 是桌面一级入口。移动端 Tab 与悬浮状态栏在桌面隐藏。
- 深色主题以 `--bg:#060608` 为底，卡片使用实色 `--glass:#121419`；大面积 `backdrop-filter` 会使 iOS 发热，只在小面积导航、弹层等处使用模糊。浅色主题保留玻璃效果。
- Tab 透镜由 `.tab-lens-track` 承担位移过渡，`.tab-lens` 承担形变；动画幅度见 `src/components/Layout.tsx` 与 `src/index.css`，修改时保持克制。
- 再点当前 Tab 返回页面顶部；子页回点所属 Tab 会回到根页。顶级页面没有返回按钮；子页必须有返回入口，移动端返回按钮固定在顶部栏。
- 设置入口分服务器设置与应用设置两组；`/settings/appearance`、`/settings/server`、`/settings/about` 是应用设置子页。

## 弹层与选择器

- 确认框、表单与详情弹层统一由 `src/components/ui.tsx` 的 `SheetProvider` 承载，居中出现。底部浮层会与 iOS 原生 TabBar 冲突。打开动画通过双 `requestAnimationFrame` 确保初始态先绘制。
- 单选项：苹果移动设备渲染真实的 `<select>` 覆盖层（`PickSelect`）；其余设备使用 `usePick` 的锚定菜单。`showPicker()` 不能作为 iOS 的唤起路径。`isAppleMobile()` 同时判断设备 UA 与 Apple vendor，以免桌面设备模拟误判。
- 防护卡“定时暂停”使用锚定菜单；关闭总开关直接执行，不弹时间选择。
- 设置页的表单标题不包裹 `<label>`，避免点击说明文字聚焦输入框；登录页保留常规 label 行为。触屏 `<select>` 的焦点环由 `selectAfterChange()` 处理，不在 `change` 中同步 `blur()`。
- 长按系统复制菜单在 Web 页面禁用，复制通过显式按钮。

## 页面行为

- 概览页提供防护卡、统计指标、趋势图、请求构成和排行榜；排行“查看更多”进入 `/top/:kind`。防护总开关采用乐观更新，失败时回退到服务端状态。
- `/protection` 是过滤功能中心，包含过滤器、允许列表、自定义规则、拦截服务、DNS 重写与规则检测；拦截服务磁贴点击后立即保存。
- 查询日志支持 `?filter=` 初始化筛选及 `?q=` 预填搜索；移动端详情为 `/log/detail` 子页，桌面使用居中弹层。
- 客户端移动端列表使用卡片，桌面把持久和自动识别客户端分成两张表。排序、搜索和分页独立于服务器查询；移动端添加/编辑进入 `/clients/form`，桌面使用居中弹层。
- 图表触摸层使用 `touch-action: pan-y`，让纵向滑动交给页面；横向 scrub 保留。长按 350ms 可以唤出数据预览，移动超过 8px 取消长按。
- Tab/筛选内容切换使用 `TabContent`，其 `value` 只随切换项变化；`Segmented` 通过滑动指示块表现当前项。

## 刷新与连接恢复

- 下拉刷新（`src/lib/pullToRefresh.ts`，接线在 `src/components/Layout.tsx`）只在移动布局 + 粗指针（触摸）设备启用；页面顶部（`window.scrollY <= 0`）的垂直下拉才接管，过阈值（64px）松手触发「status 重探 + SWR 全局 mutate」，未过阈值回弹。松手收位用 `.ptr-anim` 过渡，拖拽期间指令式 transform 跟手。
- 下拉与边缘侧滑共用 window 触摸监听，让位规则：触点在左缘 24px 条内让给侧滑、水平意图让路；转场（`useTransitionBusy`）、侧滑手势（`useGestureActive`）、刷新中一律不启用。内容位移挂在 `main` 的包裹层、指示器固定于顶部留白，两者都不在 `capturePage` 克隆范围内，转场快照管线不感知刷新。
- SWR 数据在 tab 切换时随页面重挂自动重验证（`revalidate()` 入口不检查在线状态）；status 不归 SWR 管，落地 tab 根页（`TAB_ROOT_ROUTES`）时由 Layout 调一次 `refreshStatus()`。
- 断网自愈（`.agents/pipelines/proposals/feature/2026-09-25-refresh-triggers.md`）：SWR 的在线状态不读 `navigator.onLine`、只认 `offline`/`online` 事件，iOS WKWebView/PWA 里事件可能丢失，丢失后轮询/focus/reconnect/错误重试被同一标志全部门死。全局 `SWRConfig` 设 `refreshWhenOffline: true` 让轮询不停摆；auth 以 15s 重探 `/status`（外加 `visibilitychange`/`online` 即时探），从失败恢复成功时全局 `mutate` 一次解救冻结的 key——15s 是恢复上界，事件可靠时仍是即时。
- body 的 `overscroll-behavior-y: none` 压掉浏览器原生下拉刷新（整页 reload）与橡皮筋，是自研下拉接管的前提；删除它会导致双重刷新。

## 路由与转场

- Tab 之间的程序化跳转使用 `useTabJump`：以 `replace` 保持历史栈的层级语义，同时可以播放前进动画。层级下钻使用 `push`。
- 「顶级路由」分两个概念：移动端 tab 根（`src/lib/routes.ts` 的 `TAB_ROOT_ROUTES`，4 个 tab）与桌面侧边栏根（`TOP_LEVEL_ROUTES`）。`/clients`、`/stats` 只是桌面根，移动端按二级页处理：push 进入、有原生返回按钮与侧滑返回、顶部状态条不显示。
- WKWebView 侧滑返回使用原生历史快照；程序化返回由 `src/lib/routeTransition.tsx` 的 CSS 快照层负责。转场中的新旧页面层必须不透明，相关样式为 `.rt-page-bg`。
- 移动端返回统一走 `src/lib/backNav.ts` 的 `navBack`：有历史条目就 POP，栈空（直落子页/刷新）才 replace 回父级。返回胶囊、原生按钮与表单保存/删除收尾共用它；**不得用 replace 导航到父级列表页**——那会在栈里留下重复条目，浏览器按一次返回等于没动（客户端表单保存曾如此）。
- 页内筛选/搜索状态（日志页的 `?filter=`、`?q=`）要同步进 URL，且用 `replace` 不压历史栈。否则 URL 停留在进入本页时的旧值，从详情页返回或刷新时组件按旧值重建，筛选会被拽回去。
- 原生控件（返回胶囊、顶栏操作按钮）悬浮在 WebView 之上、不参与 CSS 平移，因此**不跟随页面滑动**：页面就绪（转场过半，`useTransitionHalfBusy`）后原地淡入，离开过半再淡出；侧滑提交没有 CSS 转场时立即。实现见 `src/lib/nativeBackButton.ts` 与 `src/lib/nativeHeaderAction.ts`。
- 顶栏右侧操作按钮（`HeaderAction` / `Button size="header"` 的 `native` 规格）在 iOS 壳内由原生玻璃按钮接管：只要走原生路径，自定义（CSS）按钮就**永不显示**（手势与转场期间同样不显示），仅原生创建失败才回退；黑色过滤器页的「更新」、设置页的「保存」等同此。侧滑揭示的旧页来自 DOM 快照，快照里不补显任何自定义按钮，返回胶囊位置由原生按钮在原位补上。
- 顶栏右侧操作按钮（`PageHeader` 的 `right` 槽位）统一用 `HeaderAction`（图标按钮补 `w-11`）或 `Button size="header"`：移动端 `h-11`，与返回胶囊同高（44pt 最小可点面积）；桌面端回到 `h-10` / 与 `sm` 一致的 `h-8`。tab 根页面没有悬浮顶栏与返回按钮，其内容头部按钮不受此约定约束。
