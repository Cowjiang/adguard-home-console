# 顶部标题栏改造方案 —— 对齐 iOS 26 液态玻璃导航栏（固定返回按钮）

> 2026-09-23 迁移快照。本文保留当时的计划、调研或施工过程；当前事实以 docs/README.md 的主题页为准，未完成事项须重新登记提案。

> 2026-09-22。**更新：P1 已在分支 `feat/navbar-glass` 实施并验证通过**（模拟器一级/二级页、滚动穿透、滚动中返回；浏览器移动视口 right 动作；桌面端 ≥lg 无回归）。实施中发现并修复：Tailwind 任意值类名含空格不生成（`h-[calc(env(...) + 72px)]`），NavScrim 高度改用 inline style。桌面端与 P2 未动。下文为方案存档。

## 1. 现状（问题定位）

返回按钮与标题都出自 `src/components/ui.tsx:21` 的 `PageHeader`：

```
PageHeader（mb-4 flex items-end …）          ← Screen 内的普通文档流元素
├─ back 按钮（h-9 w-9 圆形 glass）           ← 仅 back=true 时渲染
└─ 标题 h1（26px bold，大标题风格）+ subtitle
```

随页面滚动直接滚出屏幕，滚动中无返回入口（只剩边缘侧滑手势）。各页用法盘点：

| 场景 | 页面 | 现状 |
| --- | --- | --- |
| Tab 根页（无返回） | 概览 / 过滤器 / 查询日志 / 设置 / 统计 / 客户端 | 大标题在内容流里（自绘 h1 或 PageHeader 无 back），滚走 |
| 二级页（有返回） | 设置子页×5、高级设置子页×4、过滤器子页×5、TopList、请求详情 | 返回按钮 + 大标题内联在文档流里，一起滚走；部分带 `right` 动作（保存按钮等） |
| 桌面端 ≥lg | 全部 | `PageHeader` 有 isTopLevel 时隐藏返回，沿用文档流标题（侧边栏导航，无此问题） |

另有一个隐性的布局仲裁问题：`Layout.tsx` 的状态胶囊（"防护运行中 · AdGuard Home Console"）`fixed` 居中悬在顶部，若返回按钮也固定在左上角，两者会争夺顶部空间。

## 2. 原生基准：iOS 26 液态玻璃导航栏怎么做的

依据 [HIG — Toolbars（导航栏属顶部 toolbar）](https://developer.apple.com/design/human-interface-guidelines/toolbars)、[Liquid Glass 总览](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)、[UIKit 外观定制](https://developer.apple.com/documentation/uikit/appearance-customization)：

1. **返回按钮是固定元素**：标准样式为**圆形玻璃胶囊 + 仅 chevron 符号**（HIG 明确图示"standard circular Back button"为正确做法、带 Back 文字的胶囊为错误做法），钉在导航栏前缘（左上），内容从下方滚过时它纹丝不动。
2. **栏体本身平时是透明的**：iOS 26 的栏不再铺磨砂底，靠 **scroll edge effect**（`UIScrollEdgeEffect` / `UIScrollEdgeElementContainerInteraction`）在内容滚入栏下时自动出现**渐变模糊**保证可读性；静止在顶部时几乎无痕。HIG 同时告诫"减少工具栏自定义背景"。
3. **标题两种形态**：大标题（large title）属于**内容层**，放在栏下方随内容滚动；滚过后折叠为栏内**居中 inline 标题**（17px semibold）。层级页（设置子页等）常直接用 inline。
4. **右侧动作**（保存/菜单等）同样是栏内固定玻璃胶囊，钉在前缘对称位置。
5. HIG：标题 ≤15 字符为宜。

## 3. 改造方案（分两阶段）

### 总体结构变化

把"返回按钮 + 标题 + 右侧动作"从 `PageHeader` 的文档流里拆出，收进一个新的 **固定顶部栏组件 `NavBar`**（移动端 `lg:hidden`，桌面端维持现状不动）：

```
NavBar（fixed，top = env(safe-area-inset-top)，z-40，pointer-events-none 容器）
├─ 左：返回胶囊（36pt 圆形 glass + ChevronLeft，pointer-events-auto）
├─ 中：inline 标题（17px semibold，truncate，最大宽度留出两侧胶囊）
└─ 右：动作胶囊（PageHeader 的 right 迁移至此）
```

内容层 `main` 增加顶部留白；`Screen`/页面自身的滚动内容**从栏下穿过**（现状 `Ambient` 背景已是全屏，内容需上移到安全区下方起步，滚动时穿入栏区）。

### 场景矩阵

| 场景 | 返回胶囊 | 栏内标题 | 大标题（内容层） | right 动作 |
| --- | --- | --- | --- | --- |
| 二级页（有父级） | ✓ 固定左上 | ✓ 居中 inline，常驻 | 不用（避免双标题） | ✓ 固定右上 |
| Tab 根页 | ✗ | 滚动后渐显（P2） | ✓ 保留现状 26px，随内容滚动 | 按需 |
| 登录页 / Sheet | ✗（不受影响） | ✗ | — | — |
| 桌面端 ≥lg | ✗（侧边栏导航） | 维持文档流 PageHeader | — | — |

### P1：固定返回胶囊 + 居中 inline 标题（本期）

1. 新建 `NavBar` 组件，挂在 `Layout`（或路由层），按路由元数据驱动：返回目标、标题、right。二级页信息 `PageHeader` 调用点已有，迁移成路由级配置（或保留 `PageHeader` API，内部改为 portal 到固定栏，调用点零改动——**推荐后者**，改动面最小：18 个调用点不动，只重写组件内部）。
2. 返回行为：`nav(-1)`；历史栈为空时（AGH_ROUTE 直落子页）回退到父级路由，需给每个子页配父级映射（路由表已有层级关系）。
3. 标题居中、超长 truncate（"查询日志与统计"这类长标题截断，符合 HIG ≤15 字符建议；如需完整上下文由页面内容补）。
4. `right` 动作迁入栏内（保存按钮的 dirty 状态逻辑不变，仅渲染位置变）。注意：动作多时（如 DHCP 页）胶囊宽度挤压标题，需定最大宽度优先级：返回 < 动作 < 标题截断。
5. 状态胶囊仲裁：**二级页隐藏状态胶囊**（标题即位置感，原生 app 也无常驻状态条）；Tab 根页保留现状居中胶囊。若 review 认为状态胶囊该全局保留，备选：缩小为仅图标圆点、钉在右上角与动作胶囊互换位置。
6. 栏体不铺底：静止时只有两枚玻璃胶囊 + 标题文字悬浮（对齐原生"透明栏"）。可读性兜底用**纯渐变遮罩条**（约 88pt 高，linear-gradient 从背景色到透明），不加 backdrop-filter——避开本项目"iOS 大面积 backdrop-filter 发烫"红线；两枚胶囊面积小，沿用现有 `glass` 材质开销可控。

### P2（可选）：Tab 根页大标题折叠 + 滚动边缘渐变模糊

1. 大标题滚出视口后，栏内渐显居中 inline 标题：优先用 CSS 滚动驱动动画（`animation-timeline: scroll()`，Safari 26+ 的 WKWebView 支持，零 JS、走合成器）；不支持时降级 IntersectionObserver 一行监听。页面根滚动容器是 document，天然适配。
2. scroll edge effect 增强：把 P1 的纯渐变遮罩升级为 **mask-image 渐变的窄条 backdrop-filter**（模糊量沿高度渐进 = 原生 progressive blur 观感）。此条会新增一块常驻模糊层（~402×88pt），是否值得过红线，建议真机发热实测后再定，故列为可选项。

## 4. 与既有机制的交互（review 重点）

1. **侧滑返回**：固定栏在 WKWebView 内部，转场时整体随 WebView 位移，与原生"栏不动内容动"不同——这是 WebView 壳的固有差异，无法在栏级消除（除非把导航栏也做成原生，代价大不建议）。观感可接受，需真机确认。
2. **原生玻璃 TabBar insets**：顶部改动不影响 `getTabBarInsets`（底部）；但状态胶囊隐藏/显隐会影响顶部内容起点，验证各页在 getTabBarInsets 逻辑下的顶部留白。
3. **滚动到顶**（再点 tab 回顶）：与固定栏无冲突；P2 折叠标题需同步归位（scroll-driven 动画天然同步）。
4. **菜单/弹层**：`MenuHost` 锚点下拉按 `getBoundingClientRect` 定位，`right` 迁入固定栏后锚点仍在文档流外但 rect 实时有效，无碍；注意 MenuHost 的 `window scroll close(true)` 监听与固定栏共存正常。
5. **深浅色**：胶囊沿用 `glass` 材质变量，无新增色值。

## 5. 风险与验证清单

- [ ] 各二级页固定栏出现、返回可用、历史栈空时落到父级（AGH_ROUTE 直落场景）
- [ ] 18 个 `PageHeader` 调用点渲染回归（portal 方案重点看条件渲染时序：Loading 分支也调 PageHeader）
- [ ] 带 `right` 动作页（访问控制/加密/DHCP/DNS 重写）保存按钮可点、脏状态切换正常、不遮标题
- [ ] 状态胶囊显隐仲裁后，概览/过滤器/日志/设置四根页顶部无重叠
- [ ] 滚动全程内容从栏下穿过无穿帮（状态栏区域、Ambient 背景）
- [ ] 长列表页（查询日志、DNS 重写）滚动帧率无回归（新增元素仅 2-3 枚小胶囊 + 渐变条）
- [ ] 深浅色、字号放大（Dynamic Type 不适用 Web，但需查 clamp）
- [ ] 真机：发热（backdrop-filter 红线）、侧滑转场观感

## 6. 参考

- [HIG — Toolbars（含标准圆形返回按钮图示与标题建议）](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Liquid Glass 技术总览](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)
- [UIKit — Appearance customization（UIGlassEffect / UIScrollEdgeEffect / ScrollEdgeElementContainerInteraction）](https://developer.apple.com/documentation/uikit/appearance-customization)
- [Landmarks: Building an app with Liquid Glass（官方示例）](https://developer.apple.com/documentation/swiftui/landmarks-building-an-app-with-liquid-glass)
- 项目内红线：iOS 大面积 backdrop-filter 发烫（见 .agents/logs/ios-native.md 相关记录）
