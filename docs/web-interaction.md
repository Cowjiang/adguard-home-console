# Web 端布局与交互约定

**Status:** current
**Updated:** 2026-09-23

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
- 长按系统复制菜单在 Web 页面禁用，复制通过显式按钮。原生 SwiftUI 不受这一 Web 限制。

## 页面行为

- 概览页提供防护卡、统计指标、趋势图、请求构成和排行榜；排行“查看更多”进入 `/top/:kind`。防护总开关采用乐观更新，失败时回退到服务端状态。
- `/protection` 是过滤功能中心，包含过滤器、允许列表、自定义规则、拦截服务、DNS 重写与规则检测；拦截服务磁贴点击后立即保存。
- 查询日志支持 `?filter=` 初始化筛选及 `?q=` 预填搜索；移动端详情为 `/log/detail` 子页，桌面使用居中弹层。
- 客户端移动端列表使用卡片，桌面把持久和自动识别客户端分成两张表。排序、搜索和分页独立于服务器查询；移动端添加/编辑进入 `/clients/form`，桌面使用居中弹层。
- 图表触摸层使用 `touch-action: pan-y`，让纵向滑动交给页面；横向 scrub 保留。长按 350ms 可以唤出数据预览，移动超过 8px 取消长按。
- Tab/筛选内容切换使用 `TabContent`，其 `value` 只随切换项变化；`Segmented` 通过滑动指示块表现当前项。

## 路由与转场

- Tab 之间的程序化跳转使用 `useTabJump`：以 `replace` 保持历史栈的层级语义，同时可以播放前进动画。层级下钻使用 `push`。
- WKWebView 侧滑返回使用原生历史快照；程序化返回由 `src/lib/routeTransition.tsx` 的 CSS 快照层负责。转场中的新旧页面层必须不透明，相关样式为 `.rt-page-bg`。
- 原生返回按钮悬浮在 WebView 之上；进入子页时需等 CSS 转场结束再创建，离开时立即移除。实现见 `src/lib/nativeBackButton.ts`。
