# feat/navbar-glass 交接文档（2026-09-22）

## 当前状态

分支 `feat/navbar-glass`，在 `abb8193` 之上合入了 `feat/ios-swipe-back` 的关键改动，并完成模拟器构建（debug, arm64-sim）。

## 已接入的功能

### CSS 方案（当前可用）
- **浮动导航栏**：PageHeader 在移动端二级页 portal 到 body 顶层 (`data-floating-nav`)，顶部居中标题+左胶囊返回按钮 (`src/components/ui.tsx`)
- **CSS 滑动转场**：DOM 快照路由转场 (`src/lib/routeTransition.tsx`)，push 自右滑入，pop 反向；含滚动仲裁 (scrollRestoration=manual)
- **返回按钮**：glass 样式圆形胶囊 + ChevronLeft；点击标记 `markBackTap()` 触发 pop 转场

### 已添加的 Rust 层改动（来自 feat/ios-swipe-back 端口）
- `src-tauri/Cargo.toml`：增加 `[target."cfg(target_os=\"ios\")".dependencies] objc2 = "0.6.4"`
- `src-tauri/src/lib.rs`：`enable_back_forward_gestures()` 通过 `with_webview` + `objc2::msg_send` 把 `allowsBackForwardNavigationGestures` 设置为 `true`
- 启动 log 确认：`[SWIPE-BACK] allowsBackForwardNavigationGestures = true (OK)`

### 已修改的导航语义
- `src/lib/nativeTabbar.ts`：`navigate(to)` → `navigate(to, { replace: true })`
- `src/components/Layout.tsx`：NavLink 增加 `replace` prop

## 阻塞问题（需要下一步排查）

### 问题 1：原生 TabBar 未激活
- **现象**：`useNativeTabBar()` 抛出异常返回 false，CSS TabBar 渲染
- **Log 关键行**：`[nativeTabbar] 原生 TabBar 不可用,使用 CSS 标签栏: <Error>`
- **影响范围**：
  - 原生玻璃 TabBar 不可用
  - `useNativeBackButton()` 因依赖 `nativeBar` 为 false 而不启用，CSS 浮动胶囊返回按钮接管
- **可能原因**（排查方向）：
  1. `configureTabBar` 在 Tauri iOS debug 壳内抛错（可能是未配置的 capabilities、参数名不匹配）
  2. `getTabBarInsets` 返回值结构与预期不符
  3. iOS 27 + tauri-plugin-system-components 0.1.8 的模拟器兼容性
- **注意**：模拟器（非真机）可能会缺少某些 iOS/macOS 原生组件渲染所需的 UIApplication 信号处理

### 问题 2：原生侧滑返回仍不触发
- **现象**：即便 `allowsBackForwardNavigationGestures = true`，x=0, dx=150-250pt, y=250-430pt 的 CGEvent 拖拽不触发 WKWebView 边缘 pop
- **已尝试**：4 次不同参数的 simtap drag，均未成功
- **可能原因**（排查方向）：
  1. simtap 注入的鼠标事件速度/加速度未达 WebKit 边缘手势识别阈值
  2. Tauri 的 WKWebView 未添加到手势识别所需的 view hierarchy（如缺少 UINavigationController push 历史）
  3. iOS 27 模拟器对 `allowsBackForwardNavigationGestures` 处理有变化
  4. Tauri 的 WRY 壳在 WebView 外层包裹的 UIView 拦截了手势
- **验证手段**：录制视频逐帧（simctl io recordVideo）确认手势是否到达 WebView 层

## 新增文件清单

| 文件 | 用途 |
|------|------|
| `src/lib/routes.ts` | 顶级路由常量，供 PageHeader/转场/状态条共用 |
| `src/lib/backNav.ts` | "是否点返回按钮"标记，区分 POP 转场 |
| `src/lib/nativeBackButton.ts` | createComponent 原生返回按钮控制器 + useNativeBackShown() |
| `src/lib/routeTransition.tsx` | DOM 快照路由转场组件 |

## 构建与测试要点

```bash
# 调试构建（模拟器 arm64-sim）
cd /Users/cindy.x.q.kuang/Study/adguard-home-console
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.cargo/bin:$PWD/node_modules/.bin:$PATH"
tauri ios build --debug --target aarch64-sim

# 构建产物
src-tauri/gen/apple/build/arm64-sim/AGH Console.app

# 安装 + 启动
xcrun simctl install booted "src-tauri/gen/apple/build/arm64-sim/AGH Console.app"
xcrun simctl launch booted com.adguardhome.console

# 日志捕获（验证 setup hook）
xcrun simctl spawn booted log stream --predicate 'process == "AGH Console"' --style compact
```

**常见坑**：
- `tauri ios build` 报 "failed to rename app: Directory not empty" 时，mv 旧的 `gen/apple/build` 改名后重试（勿 rm -rf）
- simtap 需要 Device Hub 窗口在前台；Simulator UDID = `1243721C-24C7-4DBB-9FDF-CD83D393B706`
- 清理构建产物 `build.old-*` 到 ~/.Trash

## Fallback 建议

如果原生 TabBar + 侧滑手势短期无法修复，CSS 方案已具备可用性：
- 浮动胶囊返回按钮外观与原生液态玻璃基本一致
- DOM 快照转场在 iOS 曲线下手感良好 (340ms, cubic-bezier(0.32, 0.72, 0, 1))
- 顶部状态条 (`TopBar` + `NavScrim`) 一级页保留悬浮胶囊
- 二级页固定栏接管 + 渐变遮罩

建议定稿时撰写 `docs/IOS_CSS_FALLBACK_DECISION.md`，记录选择 CSS 方案的原因与取舍。

## 下一步具体动作

1. **Log 深挖**：启动 app 后立即抓取完整 log（`log stream`），定位 `configureTabBar` 抛出的具体错误 + 调用栈
2. **Tauri 源码检查**：查看 `tauri-plugin-system-components` 在 iOS 端的实现（`~/.cargo/registry/src` 中的 NSView/UIView 扩展），确认模拟器环境是否所需 API
3. **侧滑诊断**：录制一次完整 drag 的 simulator 视频，逐帧对比有/无 `allowsBackForwardNavigationGestures=true` 差异；或尝试从 WRY 源码层加日志探测触摸事件是否被传递到 WKWebView
4. **如果放弃原生**：补全文档，commit CSS 方案为最终版

---

## 2026-09-23 追加:返回转场抖动/穿帮的诊断与修复(feat/ios-swipe-back)

用户报告:原生液态玻璃返回按钮已生效,但返回上一页动画生硬穿帮、页面内容抖动。
已切换到 `feat/ios-swipe-back` 工作(合并 navbar-glass,5ee12fa),逐帧录屏 + 浏览器采样定位:

### 根因(三个独立问题)

1. **page-in 重播(主因)**:QueryLog/Dashboard/Protection/Stats/TopList/LogDetail 六个页面
   绕过 `Screen` 硬编码 `page-in`,转场闩对它们无效 → 返回时内容边滑边重播 0.38s 上移淡入,
   叠加 SWR 轮询重排(sampler 实测 shell top 17→44→23 非单调跳)= 抖动。
   修复:全部改走 `usePageInClass()`(从 Screen 抽出的闩)。
2. **快照层随文档定位**:退场层 `absolute top:-y旧页` 隐含"文档滚动为 0"假设;POP 恢复
   记忆滚动后(y_mem>0)快照整体错位 y_mem 像素。修复:退场层改 `fixed` 视口锁定 +
   内层 `top:-y` 对齐,与滚动状态解耦。
3. **退场页按钮空洞**:原生按钮路由变化即移除,CSS 克隆条里又没有按钮 → 滑出的旧页按钮位
   是洞。修复:CSS 胶囊常驻 DOM 仅 `visibility:hidden`,克隆时补回 `visible`。

另两个实测结论:**WKWebView 对程序化返回无原生动画**(去掉 CSS 转场后为瞬时硬切,
simctl 录屏逐帧证实),返回转场必须由 CSS 快照层负责,`markBackTap()` 不能省;
**POP 滚动恢复首帧空操作**:日志列表条目在组件本地 state,重挂载首帧文档不可滚动,
`scrollTo(0,300)` 无效。修复:`pendingRestore` + rAF 短窗口(600ms)补滚,
浏览器实测 finalY 0→300。

### 验证

- 浏览器(paw + iPhone 仿真,JS click 避免测试工具滚动伪影):转场全程 `animationName=none`、
  单退场层、~420ms 按时移除、滚动恢复 300 ✓
- 模拟器(iPhone 18 Pro,mock-agh):/log→详情→返回 录屏逐帧:左进右出几何正确、
  快照带返回按钮、无重影、落定无幽灵按钮;滚动过的父页返回位置正确 ✓
- 附带修复:nativeBackButton 的 `inset` 属性不在插件 0.1.8 的
  `CreateComponentOptions` 里(合并进来的既有类型错误),已删(原生侧本就忽略该键)。

### 测试注意(坑)

- Playwright `getbytext` 点击会先把页面滚回顶部露出目标行,污染 scrollMem(测试伪影);
  测滚动恢复必须用 evaluate + JS `.click()`。
- 同一 task 内 scrollTo+click 合并 scroll 事件,scrollMem 会记漏(真实用户间隔秒级,无此问题)。
- simctl 录屏对 CSS 动画的帧时间不可信(丢帧/去重),动画时长验证以浏览器采样为准。
- `tauri ios build` 的 "failed to rename app: Directory not empty" 每次 rebuild 都可能踩,
  先 `mv build build.old-*` 再构建;旧目录已统一挪到 ~/.Trash。

## 2026-09-23(第二轮):真机六问题回归修复

真机验证上一轮修复后又暴露 6 个问题,归并为 4 个根因,全部修复(tsc/build 通过,
浏览器采样验证转场机制,未做视觉验证):

### 根因与修复

1. **前进转场穿帮 = 两条原生层/CSS 层不同步的 bug**
   - **导航条动画方向反了**:`PageHeader` 的 `barAnim` 三元逻辑给"新页存活导航条"
     拿了 OUT 动画(`rt-push-out` 0→-28%)。旧页导航条实际由退场快照克隆携带滑出,
     存活的新条拿 OUT 会反向平移、转场结束再跳回 —— 正是"前进穿帮"。修复:
     新条永远拿 IN(`rt-push-in`/`rt-pop-in`),以 `transition.exiting` 为开关。
   - **原生返回按钮瞬现**:原生控件悬浮在 WebView 之上,无法参与 CSS 平移,路由
     提交即出现在终点位置。修复:routeTransition 增加模块级忙闲 store
     (`useTransitionBusy`),`nativeBackButton` 的路由 effect 增加 busy 门 —— 离开
     二级页立即移除(洞由快照克隆补回),进入二级页等转场结束再创建;等待期
     `setShown(false)` 让 CSS 胶囊随导航条滑入,结束后与原生按钮同位同尺寸无缝交接。
2. **侧滑返回落地页空白/跳一下 = page-in 闩只认 CSS 转场**
   侧滑手势 POP 无 CSS 动画 → `usePageInClass` 闩不生效 → 落地页重播入场动画
   (`fill-mode: both` 首帧 opacity:0;iOS 手势转场期间动画可能被挂起不启动 →
   整页空白 = 问题 2;重播闪跳 = 问题 3)。修复:TransitionCtx 的 `dir` 改为
   "滑动转场语义方向"(CSS 动画或侧滑原生快照都置位,REPLACE/瞬时切换为 null),
   与 `exiting`(CSS 转场进行中)解耦;闩读 dir,导航条读 exiting。
3. **客户端页无动画 + 跨 tab 侧滑可返回 = 跨 tab 跳转用了 push**
   `nav('/clients')`、`nav('/log?filter=…')` 是 tab 根页之间的跳转:push 到
   TOP_LEVEL 被转场排除(硬切,问题 4),且进了 WKWebView 历史栈,侧滑会跨 tab
   返回(问题 6,违背 IOS_SWIPE_BACK_RESEARCH.md §4.3 的设计原则)。修复:新增
   `lib/navMeta.ts`(`useTabJump` = replace 不进栈 + `markNavAnim('push')` 标记),
   routeTransition 对带标记的 REPLACE 照常执行 push 动画 —— 视觉下钻、栈上平级。
   动画方向与历史栈操作从此解耦,这是通用抽象,后续跨 tab 入口一律用 `useTabJump`。
4. **原生返回按钮与标题错位 = 插件 margin 与 dx/dy 叠加**
   插件 `activateAnchorConstraints` 按 `safeAreaLayoutGuide + (margin=16)+dx/dy`
   约束定位,margin 同时作用于两轴;原参数 dx:16/dy:12 是把 CSS 坐标又叠在
   margin 上 → 按钮落在 left 32 / top safe+28(右偏 16、下偏 16)。"客户端页正常"
   是因为它是 TOP_LEVEL 不建原生按钮,显示的是 CSS 胶囊。修复:dx:0/dy:-4
   (left=16,top=safe+12,与 CSS 胶囊逐像素对齐),尺寸 34→36 对齐 h-9 w-9。

附带:POP 退场层 z 从 10 提到 50 —— 固定导航条是 body portal z-40,退场层必须
盖过它,旧页才能连同其导航条从新页之上滑走(iOS 式揭示);上限仍低于 Sheet/Toast。

### 改动文件

`lib/navMeta.ts`(新)、`lib/routeTransition.tsx`(navDir/忙闲 store/方向仲裁/退场层 z)、
`lib/nativeBackButton.ts`(busy 门 + 锚点/尺寸)、`components/ui.tsx`(barAnim 方向)、
`pages/Dashboard.tsx`(三处跨 tab 跳转改 `useTabJump`)。

### 验证(浏览器采样,无截图)

跨 tab jump:replace 后 idx 不变(0)✓、退场层存在 z=0 ✓、page-in 闩生效 ✓、
新导航条 `rt-push-in` ✓;转场结束退场层摘除 ✓;客户端页返回按钮 idx≤0 回退 '/' ✓。
下钻 push:idx+1、回顶、退场层 ✓;点返回 pop:退场层 z=50、落地页无动画重播、
滚动恢复 y=300(首帧即到位)✓。原生侧(按钮交接时机、错位、侧滑空白)需真机复验。

## 2026-09-23(第三轮):前进鬼影真因 + 原生按钮锚点真机验证

### 前进转场"旧页重叠出现"的真因:转场层透明

上两轮都修错了方向。慢动作取证(临时把 DURATION_MS 改 3000,HMR 即时生效,
paw 截图中间帧)实锤:**两个滑动转场层(新页容器/旧页快照层)自身都是透明背景**,
新页平移滑入时,旧页快照从新页的透明区域整个透出 —— 卡片叠卡片的双重曝光,
与动画方向、page-in、原生按钮都无关。之前"几何正确"的结论是在检查快照层
定位/动画名,没查透明度。

修复(index.css + routeTransition.tsx):
- 新增 `.rt-page-bg`:复制 body 底色(var(--bg))+ `.ambient` 光晕(::before,
  同参数径向渐变)。转场结束摘除类后恢复真实背景,光晕弥散无接缝感。
- 新页容器与旧页快照层在转场期间都挂 `rt-page-bg`。
- 新页容器转场期间加 `minHeight: 100dvh`:矮内容页(如规则编辑)容器高度
  不足,下半屏仍会透出快照 —— 慢动作第二帧抓到后补上。

验证:慢动作 push 中间帧全屏无旧页透出;pop 中间帧退场快照不透明滑出 ✓;
常速采样:快照克隆内无任何运行中动画、退场层按时摘除 ✓。tsc/build 通过。

### 原生按钮错位:真机/模拟器复验通过

dy=-4 修正后重建 debug 包(iPhone 18 Pro 模拟器),设置 → DNS 设置截图:
原生玻璃返回按钮与「DNS 设置」标题完全水平对齐(圆心 ≈ safe-top+12pt,
与 CSS 胶囊逐像素同位)。此前用户看到的"往下偏移"即旧参数(margin+dy 叠加)
落点 safe+28;另外注意改完必须重建安装,模拟器上不会热更新。

### 复验工具备忘

- 慢动作取证套路:临时 `DURATION_MS = 3000` → vite HMR 立即生效 → JS click
  → 等 ~1s 截图(注意 bezier(0.32,0.72,0,1) 前载严重,40% 时间已完成 ~92%
  位移,截图时机宁早勿晚)→ 改回 340。
- 模拟器走查:构建产物 `src-tauri/gen/apple/build/arm64-sim/AGH Console.app`,
  bundle id `com.adguardhome.console`;`simctl install` + `SIMCTL_CHILD_AGH_*
  launch`;tap 用 /tmp/simtap.local.swift(需 DeviceHub 前台,402x874 逻辑点,
  标定 scale 0.732);tab(355,833),设置页 DNS 行(200,304)。
