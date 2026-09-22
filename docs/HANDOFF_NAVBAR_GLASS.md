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
