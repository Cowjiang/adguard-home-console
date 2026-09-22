# iOS 手势返回（侧滑返回 + 悬停预览）调研 —— Tauri 壳线可行性

> 2026-09-22。**更新：方案 A-1 已在分支 `feat/ios-swipe-back` 实施，模拟器验证通过**（含悬停快照逐帧核对），实施与验证记录见 `TAURI_IOS_LOG.md` §11。下文为调研结论存档。

## 1. 现状

- 前端为 React SPA，`react-router-dom` 的 `BrowserRouter`（`src/App.tsx`），层级页如 `/protection/filters`、`/settings/general` 全靠 `navigate()` push，页面顶栏有返回按钮。
- Tauri iOS 壳 = 单个 WKWebView（wry 0.55.1 + tauri 2.11.6，见 `src-tauri/Cargo.lock`），没有 UINavigationController，天然没有原生侧滑返回——这不是 bug，是 WKWebView `allowsBackForwardNavigationGestures` 默认为 `false`，且 Tauri 没有暴露开关。

## 2. 原生体验是怎么来的（对照基准）

原生应用的手势返回由 UINavigationController 的 `interactivePopGestureRecognizer` 驱动：从屏幕左缘拖动时实时渲染上一视图控制器的快照，可中途悬停、可回弹取消，全程由系统 Core Animation 插值，跟手且不掉帧。"悬停"是这个交互转场的一部分，不是独立功能。

WKWebView 自带的 `allowsBackForwardNavigationGestures`（iOS 8+，[Apple 文档](https://developer.apple.com/documentation/webkit/wkwebview/1414995-allowsbackforwardnavigationgestu)）实现的是同一套 Safari 式手势：侧滑出现上一页快照、跟手、可取消，底层驱动对象是 WKWebView 的 `backForwardList`（历史栈），而不是导航控制器。

## 3. Tauri / wry 层支持情况（已查证到源码）

| 层 | 结论 | 依据 |
| --- | --- | --- |
| WKWebView | 有原生手势开关，默认关 | Apple 官方 API，行为即 Safari 式侧滑+悬停 |
| wry 0.55.1（本项目实际版本） | **已实现**该属性的透传：`WebviewAttributes::with_back_forward_navigation_gestures(bool)`，构建时调 `setAllowsBackForwardNavigationGestures`，默认 `false` | 本机 `~/.cargo/registry/.../wry-0.55.1/src/lib.rs:907` 与 `wkwebview/mod.rs:513` |
| tauri 2.11.6（本项目实际版本） | **未透出**：config JSON 与 WebviewWindowBuilder 都没有对应字段 | 本机源码 grep 无 `back_forward`；社区 issue [tauri#13367 "[feat] Navigation Gestures in Tauri config"](https://github.com/tauri-apps/tauri/issues/13367) 官方未解决 |
| tauri `with_webview` | **可用**：`PlatformWebview::inner()` 在 iOS 上返回 `*mut c_void`（即 WKWebView 指针），可在运行时自行置 `true` | 本机 `tauri-2.11.6/src/webview/mod.rs`（`#[cfg(any(target_os = "macos", target_os = "ios"))]` 分支） |

**结论：Tauri iOS 应用可以获得原生 WKWebView 手势返回（含悬停快照），不必换壳、不必 fork。** 官方没给配置项，但留了 `with_webview` 的口子，Rust 侧 `app.get_webview_window("main")` + `with_webview` + objc2 调 `setAllowsBackForwardNavigationGestures(true)` 即可，属应用级小改动（在 `src-tauri/src/lib.rs` 注册 setup 钩子，不动 tao/wry patch）。

社区另有 [tauri-plugin-backpressed](https://github.com/shuttlespace/tauri-plugin-backpressed)：封装 iOS back/forward 导航（含手势）拦截并把决策交给 JS（返回 `handled` 布尔决定是否走原生默认回退），带 vue-router 示例。若需要"返回前拦截（如表单未保存提示）"可考虑；不需要拦截则直接开开关更简单。

## 4. SPA（pushState）下的行为与限制 —— 实施前必须真机验证的点

1. **历史栈是否含 SPA 路由**：`history.pushState` 产生的同文档导航条目会进入 WKWebView 的 backForwardList，侧滑会触发真实的历史回退 → `popstate` → React Router 正常接住。方向可行，但"每个路由是否都 push、tab 切换是否 push"需要梳理（见第 5 节方案 A-2）。
2. **悬停快照的正确性（最大不确定点）→ 已实测排除**：iOS 27 模拟器录屏逐帧核对，SPA pushState 导航下侧滑中途左侧露出的是上一路由的正确实时快照，子页以圆角卡片右移，标准 iOS 交互转场（`shots-tauri/verify/swipe-frame-hover-snapshot.png`）。
3. **手势只认历史栈，不认业务层级**：如果从 `/log` push 到 `/settings`，侧滑也会返回 `/log`——与原生"返回上一层级"直觉不符。需要把导航分成两类：tab 间切换用 `navigate(to, { replace: true })`（不进历史栈，侧滑不可返回），层级下钻（概览→客户端、设置→子页、防护→子页）才 push。
4. **与横向交互的冲突**：边缘手势触发区约 20pt，`.chart-touch` 的横向 scrub、手势驱动的横向滑动一般不受影响，但表格/列表若支持横向拖动需留意；反向影响是页面内的横向手势可能顶掉边缘手势起点。
5. **手势与原生 TabBar 的层级**：手势动画作用于整个 WKWebView，原生玻璃 TabBar 在其上层不参与转场——侧滑时 TabBar 纹丝不动，原生 app 里 tab 栏本来也不动，观感应当成立，但需肉眼确认。
6. **前向（forward）手势也会被打开**：同一开关会启用右缘前滑，SPA 下前滑会"回到刚返回前的页"，通常可接受，验证时留意。

## 5. 可选方案对比

### 方案 A：开启 WKWebView 原生手势返回（推荐先试）

A-1 最小版：`with_webview` 置 `setAllowsBackForwardNavigationGestures(true)`，路由梳理成"tab 用 replace、层级用 push"。改动集中在 `src-tauri/src/lib.rs` + `App.tsx` 的导航调用点，前端零依赖。

A-2 增强版（可选）：叠加 tauri-plugin-backpressed 做返回拦截（未保存表单提示等），语义由 JS 决定。

- 优点：真·原生手感（系统插值、跟手、悬停、可取消），改动最小，无性能红线问题（不新增 backdrop-filter，不增加 JS 动画负担）。
- 缺点：悬停快照在 SPA 下的表现不受我们控制（见 4.2）；无法自定义转场动画样式；手势区域固定为系统左缘。

### 方案 B：纯前端自绘侧滑（touch 事件 + 页面平移转场）

从左缘 touchstart 起接住拖动，实时 `translateX` 当前页、左移出上一页（React 端需保留上一页挂载或截图），松手按位移判定 commit/cancel，配 framer-motion 之类做转场。

- 优点：完全可控——转场样式、悬停观感、触发宽度、哪些页面可滑都自己定；与历史栈解耦。
- 缺点：工作量数倍于方案 A；"悬停预览"必须自己维护上一页的存活副本或截图，内存与实现复杂度上升；JS 驱动的跟手动画在大面积 blur/图表页上有掉帧风险（本项目已有"iOS 大面积 backdrop-filter 发烫"红线）；与页面纵向滚动手势竞态需要仔细仲裁。社区此类方案（Capacitor/Cordova 生态的 swipe-back 插件）普遍反馈"能做但做不到原生质感"。

### 方案 C：原生层 UIScreenEdgePanGestureRecognizer + 事件桥

在 Tauri 壳 Swift 侧加边缘手势，把进度实时发给 JS 驱动转场。

- 优点：手势判定用系统实现（跟手），转场仍由 JS 渲染。
- 缺点：兼得两边的复杂度，且 4.x 同样要解决"悬停时上一页画面从哪来"。除非方案 A 的快照问题不可接受、方案 B 的手势判定又不过关，否则不值得。

## 6. 建议

1. 先做方案 A-1 的 spike：Rust 侧约 10 行 + 路由 push/replace 梳理，真机（重点真机而非模拟器，手势在真机上才准）验证第 4 节全部 6 点，尤其悬停快照观感。
2. 验证通过 → 直接定稿方案 A；快照观感不可接受 → 再评估方案 B，且 B 只在"层级页"启用（登录页、tab 根页禁用）。
3. 无论哪个方案，都要先完成 tab/层级导航语义梳理（4.3），这本身也是对现有路由健康度的修正。

## 7. 参考

- [WKWebView.allowsBackForwardNavigationGestures — Apple Developer](https://developer.apple.com/documentation/webkit/wkwebview/1414995-allowsbackforwardnavigationgestu)
- [tauri#13367 — [feat] Navigation Gestures in Tauri config（官方无解，确认未透出）](https://github.com/tauri-apps/tauri/issues/13367)
- [shuttlespace/tauri-plugin-backpressed — iOS back/forward 导航（含手势）拦截交 JS 决策](https://github.com/shuttlespace/tauri-plugin-backpressed)
- 本机源码：`wry-0.55.1/src/lib.rs`（`with_back_forward_navigation_gestures`）、`wry-0.55.1/src/wkwebview/mod.rs:513`（构建时设开关）、`tauri-2.11.6/src/webview/mod.rs`（`PlatformWebview::inner()` iOS 返回 WKWebView 指针）
