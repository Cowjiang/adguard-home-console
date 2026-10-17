# Web 端布局与交互约定

**Status:** current
**Updated:** 2026-10-18（原生顶栏按钮与 CSS 占位同尺寸、一槽一个原生组件：快照「导入」改原生图标钮、「创建」在 iOS 壳内为绿色图标钮，过滤器「更新」与纯符号按钮补 `iconOnly`；快照卡备注按单行截断）。2026-10-17（红线校准为「小面板可浮窗、超过半屏走子页」；快照列表改为整卡进详情、操作收进详情页、移动端筛选下拉；日志透视/快照比对/测速/更新/同步/安全搜索改移动端子页；同期批次页面统一回设计 token；移动端构成卡图例去掉百分比列、榜单 Tab 英文改短标签）

## 视觉与响应式结构

- 移动端为四个 Tab：`/` 概览、`/protection` 过滤器、`/logs` 日志、`/settings` 设置。`/protection` 保留旧 URL，客户端由概览入口进入。
- 桌面以 `lg`（1024px）为布局分界，使用 240px 侧边栏；客户端 `/clients` 是桌面一级入口。原统计 `/stats` 页已并入概览的桌面专属区块并从侧边栏移除，`/stats` 重定向回概览。移动端 Tab 与悬浮状态栏在桌面隐藏。
- 深色主题以 `--bg:#060608` 为底，卡片使用实色 `--glass:#121419`；大面积 `backdrop-filter` 会使 iOS 发热，只在小面积导航、弹层等处使用模糊。浅色主题保留玻璃效果。
- Tab 透镜由 `.tab-lens-track` 承担位移过渡，`.tab-lens` 承担形变；动画幅度见 `src/components/layout/Layout.tsx` 与 `src/index.css`，修改时保持克制。
- 再点当前 Tab 返回页面顶部；子页回点所属 Tab 会回到根页。顶级页面没有返回按钮；子页必须有返回入口，移动端返回按钮固定在顶部栏。
- 设置页采用双模响应式架构（方案 A）：
  - 桌面端（≥1024px）：采用内嵌二级侧栏布局（`SettingsNav` 固定粘性吸顶 + 右侧 `<Outlet />` 自适应内容区），访问 `/settings` 自动分流重定向至 `/settings/general`（离线时分流至 `/settings/appearance`）；子页 `PageHeader` 自动隐藏冗余的桌面返回按钮，仅深层表单（如 `/settings/server/edit`）保留桌面返回。
  - 移动端（<1024px）：保持 100% 原生 Hub-and-Spoke 体验，`/settings` 渲染分类大卡片列表，进入子页时保留浮动毛玻璃返回胶囊与边缘滑动手势返回。
  - 离线联动：当服务离线（`useAuth().offline`）时，桌面侧栏与移动端 Hub 同步折叠隐藏依赖 AGH 服务的设置项，仅展示控制台与服务器连接项。

## 弹层与选择器

- 浮层统一由 `src/components/ui/sheet.tsx` 的 `SheetProvider` 承载，居中出现。底部浮层会与 iOS 原生 TabBar 冲突。打开动画通过双 `requestAnimationFrame` 确保初始态先绘制。
- **移动端浮层只用于小面板（红线）**：自然高度不超过约半屏（≈50% 屏幕高度）的**确认框、少量字段的表单、实例切换**可以居中浮层；内容浏览与超过半屏的表单/列表一律子页——日志详情/透视（`/logs/detail`、`/logs/analytics`）、客户端详情/表单（`/clients/detail`、`/clients/form`）、快照比对（`/settings/snapshots/diff`）、上游测速（`/settings/dns/benchmark`）、更新详情（`/settings/about/update`）、同步目标选择（`/sync/:type`）、安全搜索（`/protection/safesearch`）。桌面端这些入口同样渲染居中弹层。判定依据是**面板自然高度**，不是内容类型；锚定选择菜单（`usePick` / `PickSelect`）是临时下拉，不受此限。依据：2026-09-22 定稿、2026-10-17 用户两次强调并按「小面板可浮窗、超过半屏不适合浮窗」校准的红线，见 `.agents/pipelines/proposals/bug-fix/2026-10-17-mobile-content-sheets-to-subpages.md`。新增面板先估高度再定形态。
- 单选项：苹果移动设备渲染真实的 `<select>` 覆盖层（`PickSelect`）；其余设备使用 `usePick` 的锚定菜单。`showPicker()` 不能作为 iOS 的唤起路径。`isAppleMobile()` 同时判断设备 UA 与 Apple vendor，以免桌面设备模拟误判。
- 防护卡“定时暂停”使用锚定菜单；关闭总开关直接执行，不弹时间选择。
- 设置页的表单标题不包裹 `<label>`，避免点击说明文字聚焦输入框；登录页保留常规 label 行为。触屏 `<select>` 的焦点环由 `selectAfterChange()` 处理，不在 `change` 中同步 `blur()`。
- 长按系统复制菜单在 Web 页面禁用，复制通过显式按钮。

## 页面行为

- 概览页提供防护卡、统计指标、趋势图、请求构成和排行榜；排行“查看更多”进入 `/top/:kind`。桌面（≥lg）在概览下方渲染完整统计分析区块（原独立统计页合并而来）：「请求构成 + 拦截趋势」为自适应 flex 行（构成卡贴内容宽度、图例不截断，拦截趋势吃剩余宽度），排行榜为左右独立瀑布流两列（热门域名/活跃客户端 | 拦截域名/上游耗时/运行状态），卡片各自贴合内容高度、不强制左右对齐。移动端把拦截序列（恶意/钓鱼、成人网站）并入流量趋势同一张图，且不显示图例（四项序列靠长按预览识别，预览里的名称与颜色与卡片一致），其余保持紧凑布局不变。图表系列色按语义对齐：查询/放行绿、拦截红（`--danger`）、恶意/钓鱼琥珀、成人/家长紫，桌面与移动一致。移动端构成卡的环图图例只给名称与数量、不显示百分比列（百分比仅桌面），名称列吃掉剩余宽度、数量贴卡片右缘对齐；移动端排行榜 Tab 用短标签（英文 Domains / Blocked / Clients），因为三段控件放不下长文案。防护总开关采用乐观更新，失败时回退到服务端状态。
- `/protection` 是过滤功能中心，包含过滤器、允许列表、自定义规则、拦截服务、DNS 重写与规则检测；拦截服务磁贴点击后立即保存。
- 设置子页的 DNS、访问控制、加密、查询与统计采用「草稿 + 保存」：任一行编辑后出现保存入口（iOS 壳内由原生按钮接管），保存成功以服务端返回值回填草稿并清除未保存标记；被忽略域名等列表写入时按行 trim、去空、去重，回填后即为服务端规范化后的内容。DHCP 无草稿、行内即时下发，加密页保存前先经 `/tls/validate` 校验。
- 设置 → 服务器连接（实例列表）：点按一行**切换**当前实例，活动实例行尾挂绿色「当前实例」badge（不再有 ✓ 与页脚说明文字）；页头右上「管理」进入管理模式——**「管理」按钮无强调色，进入后变绿色的「完成」**，每行行尾换成两个 36×36 的圆角方块按钮（`rounded-[10px]`，与行内图标同高、不撑高行，无文字、`aria-label` 兜底）：编辑（玻璃底，进 `/settings/server/edit`）与删除（`--danger-soft` 底 + 红色图标，走确认框），此时点行不再切换、当前实例 badge 让位隐藏。页头按钮用 `Button size="header"` + `native` 规格，iOS 壳内由原生玻璃按钮接管。
- 设置 → 配置快照与备份：页头「导入快照」为玻璃图标胶囊、「创建快照」移动端为绿色图标钮（`lg` 起带文字，iOS 壳内由原生图标钮接管）；「创建快照」是小面板居中浮层表单（`.field` 输入名称/备注 + 主按钮）。列表页只做索引：分类筛选用下拉选择（移动端 `PickSelect` / `usePick`，桌面 `Segmented`），右上「导出」；每张卡显示名称 + 触发类型 badge、时间与实例、备注（与时间戳同字号、单行截断），右侧箭头（垂直居中），整卡点按进入详情。详情页（移动端 `/settings/snapshots/diff?id=` 子页、桌面居中浮层，内容组件 `SnapshotDiff` 共用）把导出 JSON 与删除放在标题栏右上（移动端页头胶囊、桌面浮层标题栏），不再有取消按钮；「还原到此快照」是页底的危险行卡片（与加密设置页的重置行同款），点击走确认框。还原完成即返回列表。自动保护型快照（同步前 / 还原前）的标签与说明在生成处经 `t()` 输出。
- 移动端确认类操作（删除、还原、升级、登出等 `useConfirm`）是居中小浮层；实例切换点按状态胶囊打开切换浮层（实例很多时在浮层内滚动）。添加过滤器/重写、DHCP 静态租约等少量字段的表单同样走小浮层。
- DNS 设置的「上游基准测速」移动端进 `/settings/dns/benchmark` 子页、桌面为居中浮层（内容组件 `UpstreamBenchmark` 共用，含多实例结果页签与轮数 `Segmented`）；子页内「应用到当前配置」经一次性 handoff（`src/lib/dns/benchmarkIntent.ts`）在 POP 回设置页时写回 `upstream_dns` 草稿。
- 关于页的版本行/「检查控制台更新」在移动端进 `/settings/about/update` 子页（更新详情、发行说明与升级指引），桌面为居中浮层；子页缺 `location.state`（直落/刷新）时自行拉取 `/api/system/version`，无更新则显示空态。
- 查询日志支持 `?filter=` 初始化筛选及 `?q=` 预填搜索；移动端详情为 `/logs/detail` 子页、透视分析为 `/logs/analytics` 子页，桌面端两者都用居中弹层。子页内的下钻（点击域名/客户端/拦截类型）经一次性 handoff（`src/lib/log/drillIntent.ts`）在 POP 回列表时回填搜索或筛选并 replace 进 URL——与桌面弹层的原地回填等效，且不在历史栈留下重复条目。日志只取活动实例的数据，行内不带节点标签。
- 客户端移动端列表使用卡片，桌面把持久和自动识别客户端分成两张表。排序、搜索和分页独立于服务器查询；移动端添加/编辑进入 `/clients/form`，桌面使用居中弹层。
- 图表触摸层使用 `touch-action: pan-y`，让纵向滑动交给页面；横向 scrub 保留。长按 350ms 可以唤出数据预览，移动超过 8px 取消长按。
- Tab/筛选内容切换使用 `TabContent`，其 `value` 只随切换项变化；`Segmented` 通过滑动指示块表现当前项。

## 刷新与连接恢复

- 下拉刷新（`src/lib/pullToRefresh.ts`，接线在 `src/components/layout/Layout.tsx`）只在移动布局 + 粗指针（触摸）设备、且当前在 4 个 tab 根路由（`TAB_ROOT_ROUTES`）时启用，二级页不触发；页面顶部（`window.scrollY <= 0`）的垂直下拉才接管，过阈值（64px）松手触发「status 重探 + SWR 全局 mutate」，未过阈值回弹。刷新整体有 8s deadline（`REFRESH_DEADLINE_MS`）：断网时代理层 25s 才报超时，指示器到点先收回，失败结果自行落地。指示器锚在 `var(--safe-top) + 16px`（状态条 pill 正下方的页面留白带，卡片顶在其下 12px）做 1:1 跟手位移；松手后内容与圈一起回弹，圈停在基位旋转至刷新收口，期间状态条 pill 淡出让位、完成后淡回。松手收位用 `.ptr-anim` 过渡，拖拽期间指令式 transform 跟手。
- 「服务离线」的唯一事实源是 auth 的 `/status` 探测结果（`useAuth().offline`，多实例下由活动实例的 per-instance 会话派生）：探测失败置 true、成功置 false，`refreshStatus`（下拉刷新 / tab 落地）与 `connect`/`logout` 同步维护；`fetchStatus` 带 5s 前端 deadline，断网时不等代理层 25s 超时。状态条 pill（TopBar/Sidebar）显示「服务离线」的条件是 `offline || !status?.running`；`offline` 且在 tab 根页时 Layout 渲染 `OfflineNotice` 实色遮罩盖住旧数据（带「立即重试」），二级页不遮挡以保护表单输入；设置根页（`/settings`）豁免遮罩——它承载「实例管理」与应用设置，离线时用户可能正需要改服务器地址，改由 Settings 页隐藏依赖 AGH 服务器的「服务器设置」组，「应用设置」组保持可点（见 `.agents/pipelines/proposals/feature/2026-09-25-refresh-scope-and-offline-feedback.md`）。
- 下拉与边缘侧滑共用 window 触摸监听，让位规则：触点在左缘 24px 条内让给侧滑、水平意图让路；转场（`useTransitionBusy`）、侧滑手势（`useGestureActive`）、刷新中一律不启用。内容位移挂在 `main` 的包裹层、指示器锚在其上方做跟手位移，两者都不在 `capturePage` 克隆范围内，转场快照管线不感知刷新。
- SWR 数据在 tab 切换时随页面重挂自动重验证（`revalidate()` 入口不检查在线状态）；status 不归 SWR 管，落地 tab 根页（`TAB_ROOT_ROUTES`）时由 Layout 调一次 `refreshStatus()`。
- 断网自愈（`.agents/pipelines/proposals/feature/2026-09-25-refresh-triggers.md`）：SWR 的在线状态不读 `navigator.onLine`、只认 `offline`/`online` 事件，iOS WKWebView/PWA 里事件可能丢失，丢失后轮询/focus/reconnect/错误重试被同一标志全部门死。全局 `SWRConfig` 设 `refreshWhenOffline: true` 让轮询不停摆；auth 以 15s 重探 `/status`（外加 `visibilitychange`/`online` 即时探），从失败恢复成功时全局 `mutate` 一次解救冻结的 key——15s 是恢复上界，事件可靠时仍是即时。
- body 的 `overscroll-behavior-y: none` 压掉浏览器原生下拉刷新（整页 reload）与橡皮筋，是自研下拉接管的前提；删除它会导致双重刷新。
- 浏览器/PWA 里的左滑返回是**平台手势**，应用既不接管也不压制（曾用 `overscroll-behavior-x: none` 收掉手势的方案已否决并从历史移除）。原因：同文档（pushState）条目下，WebKit 用来「揭示」的那一层是它自己画的空白快照层，页面画不进去（与 iOS 壳关闭 `allowsBackForwardNavigationGestures` 的结论同源，只是浏览器端没有开关）；揭不出正确内容时也不要替平台改行为，返回走应用内胶囊即可。分析与仍在桌面上的选项见 `.agents/pipelines/rejected/bug-fix/2026-10-16-pwa-back-swipe-blank.md`。

## 路由与转场

- Tab 之间的程序化跳转使用 `useTabJump`：以 `replace` 保持历史栈的层级语义，同时可以播放前进动画。层级下钻使用 `push`。
- 「顶级路由」分两个概念：移动端 tab 根（`src/lib/nav/routes.ts` 的 `TAB_ROOT_ROUTES`，4 个 tab）与桌面侧边栏根（`TOP_LEVEL_ROUTES`）。`/clients` 只是桌面根，移动端按二级页处理：push 进入、有原生返回按钮与侧滑返回、顶部状态条不显示。
- 移动端边缘侧滑是自研手势（`src/lib/routeTransition.tsx` 的 `useEdgeSwipe`）：WKWebView 原生同文档侧滑的下层是空白（逐帧取证见 `.agents/logs/tauri-ios.md` §13.2），故 Rust 侧关闭 `allowsBackForwardNavigationGestures`（`src-tauri/src/lib.rs`），改由我们按历史条目 idx 保存「来路页面」克隆（`underlays`，push 落地时写入、POP/REPLACE 时修剪）当揭示层。程序化返回（返回胶囊/原生按钮/表单收尾）由 CSS 快照层（退场层 + 进场层）负责。转场中的新旧页面层必须不透明，相关样式为 `.rt-page-bg`。
- 快照克隆必须「洁净」（`capturePage` 内的 `sanitizeSnapshot`）：根节点与全部子孙都摘掉一次性入场动画类（`page-in`、`content-in`、`tab-in`、`rise-in`、`log-flash`、`rt-push-in`、`rt-push-out`、`rt-pop-in`、`rt-pop-out`、`rt-pill-in`），根节点的内联 transform/animation/transition 也清空（拖拽中的 transform 不得被烘焙进快照）。克隆重新插入 DOM 会重播 CSS 动画，而这些入场动画的首帧都在视窗外或透明（`rt-push-in` 从 `translate(100%)` 起、`rt-pop-in` 从 -28% 起、`page-in` 从 opacity 0 起）；只清子孙、漏掉页面容器根节点时，两次导航间隔小于转场时长（390ms，例如进页面后立刻再下钻）捕获的旧页快照会在下层/退场层里重播入场动画——表现为父页快照整片空白（iOS 手势期间动画被挂起时尤其明显）或整体错位，见 `.agents/pipelines/proposals/bug-fix/2026-10-16-swipe-underlay-enter-class.md`。
- 顶部状态 pill（Layout 的 `TopBar`，fixed 在页面容器之外）不在 `capturePage` 的页面容器克隆里，单独经 `[data-status-pill]` 捕获进退场层与侧滑下层：作为 fixed 元素挂视口容器直接子级（不进 `-y` 滚动对齐层），与旧页滚动位置无关，push 离开 tab 根页时随旧页保留、被新页盖过。pop 落地 tab 根页时真实 pill 属于新页、被 z-50 退场快照盖着，由 `useArrivalPopAnim` 挂 `.rt-pill-in` 与页面同步纯淡入（渲染期一次性判定 back 标记，侧滑提交/无动画返回页面瞬时就位、不淡入）；动画窗口结束必须摘类——`fill: both` 会持续压住内联 opacity，留着会让下拉刷新的 dimmed 淡出失效。
- 移动端返回统一走 `src/lib/nav/backNav.ts` 的 `navBack`：有历史条目就 POP，栈空（直落子页/刷新）才 replace 回父级。返回胶囊、原生按钮与表单保存/删除收尾共用它；**不得用 replace 导航到父级列表页**——那会在栈里留下重复条目，浏览器按一次返回等于没动（客户端表单保存曾如此）。
- 页内筛选/搜索状态（日志页的 `?filter=`、`?q=`）要同步进 URL，且用 `replace` 不压历史栈。否则 URL 停留在进入本页时的旧值，从详情页返回或刷新时组件按旧值重建，筛选会被拽回去。
- 原生控件（返回胶囊、顶栏操作按钮）悬浮在 WebView 之上、不参与 CSS 平移，因此**不跟随页面滑动**：页面就绪（转场过半，`useTransitionHalfBusy`）后原地淡入，离开过半再淡出；侧滑提交没有 CSS 转场时立即。实现见 `src/lib/native/nativeBackButton.ts` 与 `src/lib/native/nativeHeaderAction.ts`。
- 顶栏右侧操作按钮（`HeaderAction` / `Button size="header"` 的 `native` 规格）在 iOS 壳内由原生玻璃按钮接管：只要走原生路径，自定义（CSS）按钮就**永不显示**（手势与转场期间同样不显示），仅原生创建失败才回退；黑色过滤器页的「更新」、设置页的「保存」等同此。**原生按钮必须与它接管的 CSS 占位同尺寸**：占位是 44pt 图标钮（`w-11`）时，原生规格要带 `iconOnly: true` 且只给 `sfSymbol`——原生按钮按文字固有宽度排版、锚在右上角，多出的宽度向左溢出，会盖住同槽位的兄弟按钮并压过居中标题（`PageHeader` 的标题夹取只量 CSS 槽位，看不到原生按钮的真实宽度）；带文字的原生按钮只用于槽位里唯一的操作（设置页「保存」、实例页「管理/完成」）。**槽位里有两个操作时各自占一个 slot**：最右的是 slot 0（默认），它左边一个 44pt 胶囊是 `slot: 1`（快照页导入/创建、过滤器与客户端页同步/刷新与同步/新建都如此）；每个 slot 有独立原生组件 id，两个规格共用 slot 0 会互相删掉对方的按钮，而失败那边的 CSS 占位仍隐藏——那个操作会彻底消失。侧滑揭示的旧页来自 DOM 快照，快照里不补显任何自定义按钮，返回胶囊位置由原生按钮在原位补上。
- 顶栏右侧操作按钮（`PageHeader` 的 `right` 槽位）统一用 `HeaderAction`（图标按钮补 `w-11`）或 `Button size="header"`：移动端 `h-11`，与返回胶囊同高（44pt 最小可点面积）；桌面端回到 `h-10` / 与 `sm` 一致的 `h-8`。tab 根页面没有悬浮顶栏与返回按钮，其内容头部按钮不受此约定约束。
